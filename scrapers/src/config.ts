import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from project root (one level above scrapers/)
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const SUPABASE_URL = requireEnv("SUPABASE_URL");
export const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || '';
if (!SUPABASE_SERVICE_KEY) {
  throw new Error("Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_KEY");
}

// ─── Scraper tuning ───────────────────────────────────────────────────────────
/** Milliseconds to wait between HTTP requests per scraper instance */
export const REQUEST_DELAY_MS = parseInt(
  process.env.SCRAPER_REQUEST_DELAY_MS || "1500",
  10
) || 1500;

/** Maximum concurrent product-page fetches within a single scraper */
export const CONCURRENCY = parseInt(
  process.env.SCRAPER_CONCURRENCY || "3",
  10
) || 3;

// Config object for scrapers
export const config = {
  supabaseUrl: SUPABASE_URL,
  supabaseSecretKey: SUPABASE_SERVICE_KEY,
  concurrency: CONCURRENCY,
  requestDelayMs: REQUEST_DELAY_MS,
};

/** Max HTTP retries before giving up on a URL */
export const MAX_RETRIES = parseInt(optionalEnv("MAX_RETRIES", "4"), 10);

/** Base backoff ms for exponential retry (doubles each attempt) */
export const BASE_BACKOFF_MS = parseInt(
  optionalEnv("BASE_BACKOFF_MS", "2000"),
  10
);

/** HTTP request timeout in ms */
export const REQUEST_TIMEOUT_MS = parseInt(
  optionalEnv("REQUEST_TIMEOUT_MS", "30000"),
  10
);

// ─── Supplier base URLs ───────────────────────────────────────────────────────
export const PSH_BASE_URL = optionalEnv(
  "PSH_BASE_URL",
  "https://perfumersupplyhouse.com"
);

export const FRATERWORKS_BASE_URL = optionalEnv(
  "FRATERWORKS_BASE_URL",
  "https://fraterworks.com"
);

export const PA_BASE_URL = optionalEnv(
  "PA_BASE_URL",
  "https://shop.perfumersapprentice.com"
);

// ─── User agent ───────────────────────────────────────────────────────────────
export const USER_AGENT = optionalEnv(
  "SCRAPER_USER_AGENT",
  "BulkAromaBot/1.0 (+https://bulkaroma.com/bot)"
);

// ─── Currency codes ───────────────────────────────────────────────────────────
export type CurrencyCode = "USD" | "NZD" | "AUD" | "EUR" | "GBP";

// ─── Supplier keys ────────────────────────────────────────────────────────────
export type SupplierKey =
  | "perfumers_supply_house"
  | "fraterworks"
  | "perfumers_apprentice";

// ─── Shared types ─────────────────────────────────────────────────────────────
export interface RequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

export interface ParsedVariant {
  /** Human-readable size label, e.g. "25g" or "1 oz" */
  sizeLabel: string;
  /** Normalised weight in grams, null if unknown/liquid */
  grams: number | null;
  /** Normalised volume in ml, null if not liquid */
  ml: number | null;
  /** Price in the supplier's currency */
  price: number;
  /** SKU for this specific variant */
  sku: string | null;
  /** Whether this variant is purchasable */
  inStock: boolean;
}

export interface ParsedProduct {
  name: string;
  normalizedName: string;
  brand: string | null;
  casNumber: string | null;
  description: string | null;
  url: string;
  imageUrl: string | null;
  sku: string | null;
  variants: ParsedVariant[];
}

export interface ScrapeRunSummary {
  scrapeRunId: string;
  supplierKey: SupplierKey;
  productsScraped: number;
  variantsScraped: number;
  errors: number;
  durationMs: number;
  status: "success" | "partial" | "failed" | "blocked";
}
