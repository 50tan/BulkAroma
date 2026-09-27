import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const REQUIRED_TABLES = [
  'materials',
  'material_aliases',
  'supplier_products',
  'product_variants',
  'price_observations',
  'supplier_sources',
  'currency_rates',
  'scrape_runs',
  'match_mappings',
  'user_match_overrides',
  'crawl_errors',
  'export_jobs',
];

const REQUIRED_VIEWS = [
  'latest_price_per_variant',
  'current_supplier_prices',
  'common_materials_view',
  'supplier_coverage_summary',
  'price_history_view',
  'data_quality_summary',
];

function pass(msg: string) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
function fail(msg: string) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); return false; }

async function main() {
  let allPassed = true;

  console.log('\n\x1b[1mBulkaroma Price Intelligence — Database Check\x1b[0m\n');

  // --- 1. Environment variables ---
  console.log('Checking environment variables...');
  if (!SUPABASE_URL) { fail('SUPABASE_URL is not set'); allPassed = false; }
  else pass('SUPABASE_URL is set');

  if (!SUPABASE_SECRET_KEY) { fail('SUPABASE_SECRET_KEY is not set'); allPassed = false; }
  else pass('SUPABASE_SECRET_KEY is set');

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    console.log('\n\x1b[31mMissing required environment variables. Check backend/.env\x1b[0m');
    process.exit(1);
  }

  // Validate URL format
  if (!SUPABASE_URL.includes('.supabase.co')) {
    fail(`SUPABASE_URL doesn't look like a valid Supabase URL: ${SUPABASE_URL}`);
    allPassed = false;
  } else {
    pass(`SUPABASE_URL format looks valid`);
  }

  // --- 2. Connection ---
  console.log('\nChecking Supabase connection...');
  const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { error } = await supabase.from('materials').select('id').limit(1);
    if (error && error.code === 'PGRST116') {
      // Table doesn't exist — connection worked but table is missing
      pass('Supabase connection successful');
    } else if (error) {
      if (error.message.includes('relation') && error.message.includes('does not exist')) {
        pass('Supabase connection successful (tables not yet created)');
      } else {
        fail(`Connection error: ${error.message}`);
        allPassed = false;
      }
    } else {
      pass('Supabase connection successful');
    }
  } catch (err) {
    fail(`Could not connect to Supabase: ${(err as Error).message}`);
    console.log('\n  Is your SUPABASE_URL correct? Is the project active?');
    allPassed = false;
    process.exit(1);
  }

  // --- 3. Required tables ---
  console.log('\nChecking required tables...');
  const missingTables: string[] = [];

  for (const table of REQUIRED_TABLES) {
    const { error } = await supabase.from(table).select('*').limit(0);
    if (error && (error.message.includes('does not exist') || error.code === '42P01')) {
      fail(table);
      missingTables.push(table);
      allPassed = false;
    } else {
      pass(table);
    }
  }

  if (missingTables.length > 0) {
    console.log('\n\x1b[33m  Missing tables detected.\x1b[0m');
    console.log('  To fix: Open Supabase Dashboard → SQL Editor → run these migration files in order:');
    console.log('    supabase/migrations/202609270001_initial_schema.sql');
    console.log('    supabase/migrations/202609270002_rls_policies.sql');
    console.log('    supabase/migrations/202609270003_indexes.sql');
    console.log('    supabase/migrations/202609270004_functions.sql');
    console.log('    supabase/migrations/202609270005_views.sql');
  }

  // --- 4. Required views ---
  console.log('\nChecking required views...');
  const missingViews: string[] = [];

  for (const view of REQUIRED_VIEWS) {
    const { error } = await supabase.from(view).select('*').limit(0);
    if (error && (error.message.includes('does not exist') || error.code === '42P01')) {
      fail(view);
      missingViews.push(view);
      allPassed = false;
    } else {
      pass(view);
    }
  }

  if (missingViews.length > 0) {
    console.log('\n\x1b[33m  Missing views detected.\x1b[0m');
    console.log('  To fix: Run supabase/migrations/202609270005_views.sql in SQL Editor');
  }

  // --- 5. supplier_sources seed data ---
  console.log('\nChecking supplier seed data...');
  const { data: sources } = await supabase.from('supplier_sources').select('supplier');
  const supplierKeys = (sources || []).map((s: { supplier: string }) => s.supplier);
  const required = ['psh', 'fraterworks', 'pa'];
  for (const s of required) {
    if (supplierKeys.includes(s)) pass(`supplier_sources: ${s}`);
    else { fail(`supplier_sources missing: ${s}`); allPassed = false; }
  }

  // --- Summary ---
  console.log('\n' + '─'.repeat(50));
  if (allPassed) {
    console.log('\x1b[32m\n✓ All checks passed. Database is ready.\x1b[0m');
    console.log('\nNext steps:');
    console.log('  1. npm run dev');
    console.log('  2. npm run scrape:psh (test crawl)');
    console.log('  3. Open http://localhost:5173\n');
  } else {
    console.log('\x1b[31m\n✗ Some checks failed. Follow the instructions above.\x1b[0m\n');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
