# Bulkaroma Price Intelligence — Supabase Setup Guide

This guide walks you through creating and configuring the Supabase database for the Bulkaroma Price Intelligence system. Follow every step in order.

> **Tip:** If you get stuck, open [supabase.com/docs](https://supabase.com/docs) — it has excellent documentation.

---

## Step 1 — Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New project**.
3. Choose your organization.
4. Fill in:
   - **Project name:** `bulkaroma-price-intelligence` (or any name you prefer)
   - **Database password:** Choose a strong password and save it securely. You will need it for the database connection string.
   - **Region:** Choose the region closest to your users.
5. Click **Create new project**.
6. Wait 1–2 minutes while Supabase provisions your database.

---

## Step 2 — Open the Project Dashboard

1. Once provisioning is complete, you will land on the project dashboard.
2. The URL will look like: `https://supabase.com/dashboard/project/xxxxxxxxxxxxxxxxxxxx`
3. Keep this browser tab open — you will return to it frequently.

---

## Step 3 — Find Your API Credentials

1. In the left sidebar, click **Project Settings** (gear icon at the bottom).
2. Click **API**.
3. You will see:

| Name | What it is | Where it goes |
|------|-----------|---------------|
| **Project URL** | Your project's base URL | `VITE_SUPABASE_URL` and `SUPABASE_URL` |
| **Publishable key** | Safe for browsers, respects RLS | `VITE_SUPABASE_PUBLISHABLE_KEY` |
| **Secret key** | Bypasses RLS — **server only** | `SUPABASE_SECRET_KEY` |

> **⚠️ Security Warning:**
> - The **Publishable key** is safe to include in your frontend React code.
> - The **Secret key** bypasses Row Level Security and can read/write any data. **NEVER** put it in your React/Vite code. **NEVER** prefix it with `VITE_`. Keep it only in your backend `.env` file.
> - **NEVER** commit your `.env` file to Git.

---

## Step 4 — Find Your Database Connection String

1. In **Project Settings → Database**.
2. Scroll to **Connection string**.
3. Select **URI** mode.
4. Copy the connection string — it looks like:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxxxxxxxxx.supabase.co:5432/postgres
   ```
5. Replace `[YOUR-PASSWORD]` with the database password you set in Step 1.
6. **Important:** If your password contains special characters like `@`, `#`, `%`, you must URL-encode them:
   - `@` → `%40`
   - `#` → `%23`
   - `%` → `%25`
   - Example: password `abc@def` becomes `abc%40def` in the URL.
7. This goes into `SUPABASE_DB_URL` in your backend `.env` — never in frontend code.

---

## Step 5 — Configure Your Environment Files

1. Copy `.env.example` to `.env` in the project root:
   ```bash
   cp .env.example .env
   ```
2. Open `.env` and fill in your values:
   ```env
   VITE_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable__your_key_here

   SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
   SUPABASE_SECRET_KEY=sb_secret_your_secret_key_here

   SUPABASE_DB_URL=postgresql://postgres:your_password@db.xxxxxxxxxxxxxxxxxxxx.supabase.co:5432/postgres
   ```
3. Also copy `.env.example` to `backend/.env` and fill in the server-only variables.
4. **Confirm `.env` is in your `.gitignore`.** Run:
   ```bash
   git status
   ```
   You should NOT see `.env` in the list of tracked files.

---

## Step 6 — Create the Database Schema

The project ships with SQL migration files in `supabase/migrations/`. You need to run these in Supabase's SQL Editor.

The migration files are:

| File | Contents |
|------|----------|
| `202609270001_initial_schema.sql` | All tables |
| `202609270002_rls_policies.sql` | Row Level Security policies |
| `202609270003_indexes.sql` | Database indexes |
| `202609270004_functions.sql` | PostgreSQL functions |
| `202609270005_views.sql` | Database views |

---

## Step 7 — Run Migrations Using SQL Editor

1. In the Supabase Dashboard, click **SQL Editor** in the left sidebar.
2. Click **+ New query**.
3. Open `supabase/migrations/202609270001_initial_schema.sql` in your code editor.
4. Copy the entire contents.
5. Paste it into the SQL Editor.
6. Click **Run** (or press `Ctrl+Enter` / `Cmd+Enter`).
7. You should see: `Success. No rows returned.`
8. Repeat for each migration file **in order**:
   - `202609270002_rls_policies.sql`
   - `202609270003_indexes.sql`
   - `202609270004_functions.sql`
   - `202609270005_views.sql`

> **Tip:** Run one file at a time. If a file fails, read the error message carefully. Common issues:
> - Running migrations out of order (always run in order)
> - Typos in table names (unlikely since these are generated)
> - Insufficient permissions (you should be the project owner)

---

## Step 8 — Verify the Tables Were Created

1. In the Supabase Dashboard, click **Table Editor** in the left sidebar.
2. You should see these tables:

```
✓ materials
✓ material_aliases
✓ supplier_products
✓ product_variants
✓ price_observations
✓ supplier_sources
✓ currency_rates
✓ scrape_runs
✓ match_mappings
✓ user_match_overrides
✓ crawl_errors
✓ export_jobs
```

If any tables are missing, re-run the first migration file.

---

## Step 9 — Verify Row Level Security

1. In the Supabase Dashboard, click **Authentication** → **Policies**.
2. You should see RLS policies listed for each table.
3. RLS is enabled when you see the policy list — not when the table shows "No policies" (that means RLS is off).

> **What is Row Level Security?**
> RLS lets you control which rows a user can read or write at the database level. Even if someone gets your Publishable Key, they can only access what the RLS policies allow. The Secret Key bypasses RLS — that's why it must stay server-side.

---

## Step 10 — Configure Supabase Storage

Excel exports can be stored in Supabase Storage:

1. In the Supabase Dashboard, click **Storage** in the left sidebar.
2. Click **New bucket**.
3. Name it: `exports`
4. Set it to **Private** (not public — you don't want anyone to download admin data).
5. The backend will upload generated Excel files here and create signed URLs for download.

---

## Step 11 — Configure Authentication

For admin features:

1. In **Authentication → Settings**, enable **Email** provider (enabled by default).
2. Go to **Authentication → Users**.
3. Click **Add user** → **Create new user**.
4. Enter your admin email and a strong password.
5. The admin area in the application will be protected by Supabase Auth.

---

## Step 12 — Run the Application Setup Check

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the database check:
   ```bash
   npm run db:check
   ```
3. You should see:
   ```
   Checking Supabase connection...
   ✓ Connection successful

   Checking database schema...
   ✓ materials
   ✓ material_aliases
   ✓ supplier_products
   ✓ product_variants
   ✓ price_observations
   ✓ currency_rates
   ✓ scrape_runs
   ✓ match_mappings
   ✓ user_match_overrides
   ✓ crawl_errors
   ✓ export_jobs

   Checking views...
   ✓ current_supplier_prices
   ✓ common_materials_view
   ✓ latest_price_per_variant
   ✓ supplier_coverage

   ✓ Setup complete. Ready to scrape.
   ```
4. If anything shows ✗, follow the printed instructions.

---

## Step 13 — Start Development

```bash
# Start backend + frontend together
npm run dev

# Or individually:
npm run dev --workspace=backend   # http://localhost:3001
npm run dev --workspace=frontend  # http://localhost:5173

# Run a small test scrape (PSH only, limited pages)
npm run scrape:psh

# Check data in Supabase Table Editor
# Then run the full application
```

---

## Credential Mapping Reference

| Supabase Dashboard Label | Environment Variable | Safe For |
|--------------------------|---------------------|----------|
| Project URL | `VITE_SUPABASE_URL` | ✅ Browser |
| Project URL | `SUPABASE_URL` | ✅ Server |
| Publishable key | `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ Browser |
| Secret key | `SUPABASE_SECRET_KEY` | 🔒 Server ONLY |
| Database URI | `SUPABASE_DB_URL` | 🔒 Server ONLY |

---

## Security Checklist

> [!CAUTION]
> Failing to follow these rules can expose your entire database.

- [ ] `.env` is in `.gitignore`
- [ ] `SUPABASE_SECRET_KEY` is NOT in any `VITE_` prefixed variable
- [ ] `SUPABASE_SECRET_KEY` is NOT in any frontend file
- [ ] `SUPABASE_DB_URL` is NOT in any frontend file
- [ ] RLS is enabled on all tables
- [ ] Supabase Storage bucket `exports` is Private
- [ ] You have not committed `.env` to Git

---

## Troubleshooting

### "Invalid API key"
Your publishable or secret key is wrong. Double-check in Project Settings → API.

### "relation does not exist"
The migrations haven't been run yet. Follow Step 7.

### "permission denied for table"
RLS is blocking access. Check that you're using the correct key (publishable vs secret) and that the RLS policies are correct.

### "password authentication failed"
Your `SUPABASE_DB_URL` has the wrong password. Remember to URL-encode special characters.

### "connection refused" or timeout
Check that your Supabase project is active (not paused). Free-tier projects pause after inactivity.
