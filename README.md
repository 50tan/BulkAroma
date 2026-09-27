# Bulkaroma Price Intelligence

A production-quality perfumery raw-material price intelligence, comparison, and procurement system.

Search a perfumery raw material once, find it across multiple suppliers, compare actual prices and normalized prices, calculate procurement costs, convert currencies, track historical prices, and export to Excel.

## Supported Suppliers

- **Perfumer Supply House** — perfumersupplyhouse.com
- **Fraterworks** — fraterworks.com  
- **The Perfumer's Apprentice** — shop.perfumersapprentice.com

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- A Supabase account and project

### 1. Set up Supabase

See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) for complete database setup instructions.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

Also copy to the backend workspace:
```bash
cp .env.example backend/.env
```

### 4. Run database setup check

```bash
npm run db:check
```

### 5. Start development

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start frontend + backend in development mode |
| `npm run build` | Build all workspaces for production |
| `npm run lint` | Lint all workspaces |
| `npm run test` | Run all tests |
| `npm run scrape` | Run all supplier scrapers |
| `npm run scrape:psh` | Scrape Perfumer Supply House only |
| `npm run scrape:fraterworks` | Scrape Fraterworks only |
| `npm run scrape:pa` | Scrape The Perfumer's Apprentice only |
| `npm run export` | Generate Excel workbook |
| `npm run db:check` | Verify Supabase database schema |

## Project Structure

```
bulkaroma-price-intelligence/
├── frontend/          # React + TypeScript + Vite + Tailwind
├── backend/           # Node.js + Express + TypeScript
├── shared/            # Shared types and utilities
├── scrapers/          # Supplier scraper modules
├── supabase/
│   ├── migrations/    # SQL migration files
│   ├── functions/     # PostgreSQL functions
│   └── seed/          # Seed data
├── exports/           # Generated Excel/CSV files
├── tests/             # Test suites
├── docs/              # Additional documentation
├── .env.example       # Environment variable template
├── SUPABASE_SETUP.md  # Database setup guide
└── README.md
```

## Environment Variables

See [.env.example](./.env.example) for all required variables with descriptions.

**Security:** Never commit `.env` to Git. Never put `SUPABASE_SECRET_KEY` in frontend code.

## Data Pipeline

```
Supplier Website → Scraper → Raw Data → Normalization → Material Matching
→ Variant Extraction → Price Observation → Supabase PostgreSQL
→ Common-Quantity Engine → Currency Conversion → Comparison UI → Excel Export
```

## License

Proprietary — Bulkaroma
