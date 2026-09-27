# Deploying BulkAroma Full-Stack to Vercel

This guide provides end-to-end instructions for deploying the **BulkAroma Price Intelligence** platform (React Vite frontend + Express serverless API) to **Vercel** with **Supabase PostgreSQL** as the persistent database and storage backend.

---

## 1. Architecture Overview

```
                                  Vercel Deployment
               ┌──────────────────────────────────────────────────────┐
               │                                                      │
               │   Browser Request                                    │
               │         │                                            │
               │         ▼                                            │
               │    Vercel Edge / CDN                                 │
               │    ├── Static Files & SPA Routes  ──> frontend/dist  │
               │    │   (/, /compare, /material/:id)   (Vite React)   │
               │    │                                                 │
               │    └── API & Cron Rewrites        ──> api/index.ts   │
               │        (/api/*, /health)              (Express App)  │
               │                                            │         │
               └────────────────────────────────────────────┼─────────┘
                                                            │
                                  Supabase Cloud            │
               ┌────────────────────────────────────────────┼─────────┐
               │                                            ▼         │
               │    PostgreSQL Database (REST & Direct Pooler)        │
               │    ├── materials, supplier_products, variants        │
               │    ├── price_observations, currency_rates            │
               │    └── scrape_runs, crawl_errors, export_jobs        │
               │                                                      │
               │    Supabase Storage Bucket                           │
               │    └── exports/workbooks/ (Excel .xlsx downloads)    │
               └──────────────────────────────────────────────────────┘
```

Both frontend and backend live in the same repository and deploy as a single unified Vercel deployment sharing the same domain.

---

## 2. Vercel Project Configuration

When importing `https://github.com/50tan/BulkAroma` into Vercel:

| Setting | Value | Notes |
| :--- | :--- | :--- |
| **Framework Preset** | `Vite` | Detected automatically |
| **Root Directory** | `./` | Root of repository |
| **Build Command** | `npm run build` | Builds `shared`, `scrapers`, `backend`, and `frontend` |
| **Output Directory** | `frontend/dist` | Serves compiled React SPA assets |
| **Install Command** | `npm install` | Installs root and workspace dependencies |
| **Node.js Version** | `20.x` | Set in Project Settings > General |

---

## 3. Environment Variables

Configure these variables in your Vercel Project (**Project Settings → Environment Variables**):

### A. Frontend Variables (Browser Safe)

| Variable | Environment | Description | Example |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Production, Preview, Dev | Supabase project URL | `https://sawarikzgcyvzuziwkhk.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Production, Preview, Dev | Supabase Publishable / Anon Key | `sb_publishable_your_key_here` |

> [!NOTE]
> Only variables prefixed with `VITE_` are bundled into frontend client-side code.

### B. Backend & Serverless Variables (Server-Only Secrets)

| Variable | Environment | Description | Example |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Production, Preview, Dev | Supabase project URL | `https://sawarikzgcyvzuziwkhk.supabase.co` |
| `SUPABASE_SECRET_KEY` | Production, Preview, Dev | Supabase Service Role / Secret Key | `sb_secret_your_key_here` |
| `SUPABASE_DB_URL` | Production, Preview, Dev | Direct or Pooled Postgres connection URI | `postgresql://postgres:...` |
| `NODE_ENV` | Production | Node runtime mode | `production` |
| `EXPORT_BUCKET` | Production, Preview, Dev | Supabase Storage bucket for Excel files | `exports` |
| `CRON_SECRET` | Production, Preview, Dev | Secret for authenticating Vercel Crons | Strong random string (e.g. `openssl rand -hex 32`) |
| `CURRENCY_API_PROVIDER` | Production, Preview, Dev | Live currency provider | `exchangerate-api` |
| `CURRENCY_API_KEY` | Production, Preview, Dev | Optional ExchangeRate API Key | `your_api_key_here` |

> [!CAUTION]
> Never prefix `SUPABASE_SECRET_KEY` or `SUPABASE_DB_URL` with `VITE_`. These keys must remain private to serverless functions.

---

## 4. Routing & Serverless Function Setup

The platform uses [`vercel.json`](../vercel.json) to handle rewrites and scheduled cron tasks:

- **Static Assets & SPA Navigation:** Requests that do not match `/api/*` or `/health` are routed to `frontend/dist/index.html`. This ensures direct browser refreshes on routes like `/compare`, `/common-materials`, and `/material/:id` never return 404s.
- **Unified API Routing:** All requests starting with `/api/` or `/health` are routed to `api/index.ts`, which runs the Express application from `backend/src/app.ts`.
- **Automated Supplier Refresh (Vercel Cron):** A scheduled daily cron triggers `GET /api/cron/refresh-suppliers` at 02:00 UTC, authenticated via `CRON_SECRET`.

---

## 5. Storage Configuration (Excel Exports)

In a serverless environment, local container disk storage is ephemeral and read-only (except `/tmp`). BulkAroma handles this seamlessly:

1. When a user or admin requests an export (`POST /api/export` or `POST /api/export/common-materials`), the serverless function constructs the workbook buffer.
2. The workbook is uploaded to the Supabase Storage bucket (`exports`).
3. A secure signed URL valid for 24 hours is returned.
4. If accessing via fallback, `GET /api/export/download/:id` streams the binary workbook directly from Supabase Storage with attachment headers (`Content-Disposition: attachment; filename="..."`).

Ensure the `exports` bucket is created in Supabase:
- Go to **Supabase Dashboard → Storage → Create New Bucket**.
- Name: `exports`.
- Access: Private.

---

## 6. Verification Checklist

After deployment, test the following endpoints on your Vercel deployment URL (e.g. `https://bulkaroma.vercel.app`):

1. **System Health:**
   ```bash
   curl -i https://<your-vercel-domain>/health
   curl -i https://<your-vercel-domain>/api/health
   ```
   *Expected response:* `HTTP 200` with JSON `{ "status": "ok", "version": "1.0.0", ... }`.

2. **Platform Statistics:**
   ```bash
   curl -s https://<your-vercel-domain>/api/stats | jq .
   ```
   *Expected response:* Real material, product, and variant counts from Supabase.

3. **Live Search Autocomplete:**
   ```bash
   curl -s "https://<your-vercel-domain>/api/search?q=iso" | jq .
   ```
   *Expected response:* Array of matched materials with CAS and supplier counts.

4. **Multi-Supplier Price Comparison:**
   ```bash
   curl -X POST https://<your-vercel-domain>/api/compare \
     -H "Content-Type: application/json" \
     -d '{"query":"Iso E Super","targetQuantity":100,"targetUnit":"g","displayCurrency":"INR"}'
   ```
   *Expected response:* Multi-supplier comparison with packages required, actual cost in INR, and normalized price.

5. **Client-Side SPA Refresh:**
   Open `https://<your-vercel-domain>/common-materials` in your browser and press **F5 / Refresh**.
   *Expected behavior:* The page reloads directly without showing a 404 error.

6. **Excel Export Generation:**
   Trigger export and verify download:
   ```bash
   curl -X POST https://<your-vercel-domain>/api/export \
     -H "Content-Type: application/json" \
     -d '{"type":"complete_workbook"}'
   ```
   Poll the returned `id` via `GET /api/export/:id` until `status` is `completed`.

---

## 7. Troubleshooting

- **CORS Errors:**
  `backend/src/app.ts` allows requests from any `*.vercel.app` domain, `localhost`, and `bulkaroma.com`. If using a custom production domain, it is automatically supported.
- **Function Timeouts on Full Crawls:**
  Vercel Serverless Functions have a maximum execution timeout (10s on Hobby, up to 300s on Pro). Full scraping across 3 suppliers with thousands of items should be run in chunked batches (using `maxPages`) or triggered via CLI (`npm run scrape:full`). Single product refreshes (`POST /api/scrape/refresh`) execute in under 3 seconds.
- **Database Connection Limits:**
  For serverless functions, use Supabase's transaction or session connection pooler (`port 6543` / `pooler.supabase.com`) if experiencing connection exhaustion.
