import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optional(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const env = {
  supabaseUrl: required('SUPABASE_URL'),
  supabaseSecretKey: required('SUPABASE_SECRET_KEY'),
  supabaseDbUrl: optional('SUPABASE_DB_URL', ''),
  port: parseInt(optional('PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  scraperCacheTtl: parseInt(optional('SCRAPER_CACHE_TTL', '3600'), 10),
  scraperConcurrency: parseInt(optional('SCRAPER_CONCURRENCY', '3'), 10),
  scraperRequestDelayMs: parseInt(optional('SCRAPER_REQUEST_DELAY_MS', '1500'), 10),
  currencyApiProvider: optional('CURRENCY_API_PROVIDER', 'exchangerate-api'),
  currencyApiKey: optional('CURRENCY_API_KEY', ''),
  exportBucket: optional('EXPORT_BUCKET', 'exports'),
  cronSecret: optional('CRON_SECRET', ''),
  adminSecret: optional('ADMIN_SECRET', ''),
};
