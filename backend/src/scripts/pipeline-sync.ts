import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

import { supabase } from '../config/supabase';
import {
  PerfumerSupplyHouseScraper,
  FraterworksScraper,
  PerfumersApprenticeScraper,
} from '@bulkaroma/scrapers';
import { runMatchingPipeline } from './run-matching-pipeline';
import { ExportService } from '../services/export.service';

interface PipelineOptions {
  supplier: 'all' | 'psh' | 'fraterworks' | 'pa';
  resume: boolean;
  maxPages?: number;
  skipExport: boolean;
}

function parseArgs(): PipelineOptions {
  const args = process.argv.slice(2);
  let supplier: 'all' | 'psh' | 'fraterworks' | 'pa' = 'all';
  let resume = false;
  let maxPages: number | undefined;
  let skipExport = false;

  for (const arg of args) {
    if (arg.startsWith('--supplier=')) {
      const val = arg.split('=')[1].toLowerCase();
      if (['all', 'psh', 'fraterworks', 'pa'].includes(val)) {
        supplier = val as any;
      }
    } else if (arg === '--resume') {
      resume = true;
    } else if (arg.startsWith('--maxPages=')) {
      const val = parseInt(arg.split('=')[1], 10);
      if (!isNaN(val) && val > 0) maxPages = val;
    } else if (arg === '--skip-export' || arg === '--skipExport') {
      skipExport = true;
    }
  }

  return { supplier, resume, maxPages, skipExport };
}

export async function runPipelineSync() {
  const options = parseArgs();
  console.log('\n======================================================');
  console.log('🌿 Bulkaroma — Automated Production Catalog Pipeline');
  console.log('======================================================');
  console.log(`Target Supplier : ${options.supplier.toUpperCase()}`);
  console.log(`Resume Mode     : ${options.resume ? 'ENABLED (Checkpoint-aware)' : 'DISABLED (Fresh run)'}`);
  console.log(`Max Pages/Chunk : ${options.maxPages ? options.maxPages : 'Full Catalog'}`);
  console.log(`Auto Excel Sync : ${options.skipExport ? 'SKIPPED' : 'ENABLED'}`);
  console.log('======================================================\n');

  const suppliers: Array<'psh' | 'fraterworks' | 'pa'> =
    options.supplier === 'all' ? ['psh', 'fraterworks', 'pa'] : [options.supplier];

  const results: Record<string, { status: string; products: number; variants: number; errors: number }> = {};

  // ─── STEP 1: INDEPENDENT SUPPLIER CRAWLS ────────────────────────────────────
  for (const s of suppliers) {
    console.log(`\n▶ Starting crawl for [${s.toUpperCase()}]...`);
    results[s] = { status: 'running', products: 0, variants: 0, errors: 0 };

    try {
      let scraper: any;
      if (s === 'psh') scraper = new PerfumerSupplyHouseScraper();
      else if (s === 'fraterworks') scraper = new FraterworksScraper();
      else scraper = new PerfumersApprenticeScraper();

      let startPage = 1;
      if (options.resume) {
        const checkpoint = await scraper.getLastCheckpoint();
        if (checkpoint && typeof checkpoint.lastCompletedPage === 'number') {
          startPage = checkpoint.lastCompletedPage + 1;
          console.log(`  [${s.toUpperCase()}] Found checkpoint. Resuming from page ${startPage}...`);
        }
      }

      const summary = await scraper.run({
        maxPages: options.maxPages,
        startPage,
      });

      results[s] = {
        status: summary.errorsCount > 0 && summary.productsUpdated === 0 ? 'failed' : 'completed',
        products: summary.productsUpdated,
        variants: summary.variantsFound,
        errors: summary.errorsCount,
      };
      console.log(`✓ [${s.toUpperCase()}] Completed: ${summary.productsUpdated} products updated, ${summary.variantsFound} variants.`);
    } catch (err: any) {
      console.error(`✗ [${s.toUpperCase()}] Crawl failed:`, err.message);
      results[s] = {
        status: 'partial',
        products: 0,
        variants: 0,
        errors: 1,
      };
      console.log(`  (Continuing to remaining suppliers to preserve independence)\n`);
    }
  }

  // ─── STEP 2: AUTOMATIC MATERIAL MATCHING PIPELINE ────────────────────────────
  console.log('\n======================================================');
  console.log('▶ Rebuilding Material Matches & Canonical Associations...');
  console.log('======================================================');
  try {
    await runMatchingPipeline();
    console.log('✓ Material matching pipeline completed successfully.');
  } catch (matchErr: any) {
    console.error('✗ Matching pipeline error:', matchErr.message);
  }

  // ─── STEP 3: AUTOMATIC EXCEL REGENERATION ────────────────────────────────────
  if (!options.skipExport) {
    console.log('\n======================================================');
    console.log('▶ Regenerating Master 8-Sheet Excel Export...');
    console.log('======================================================');
    try {
      const { data: job } = await supabase
        .from('export_jobs')
        .insert({
          job_type: 'complete_workbook',
          status: 'pending',
        })
        .select('id')
        .single();

      const jobId = job?.id || `auto-${Date.now()}`;
      const exportService = new ExportService();
      const savedPath = await exportService.generateCompleteWorkbook(jobId);
      console.log(`✓ Master Excel Export generated & uploaded to Supabase Storage: ${savedPath}`);
    } catch (exportErr: any) {
      console.error('✗ Excel export regeneration error:', exportErr.message);
    }
  }

  // ─── STEP 4: SUMMARY VERIFICATION ───────────────────────────────────────────
  console.log('\n======================================================');
  console.log('🏁 Production Pipeline Sync Completed');
  console.log('======================================================');
  console.table(results);
}

if (require.main === module) {
  runPipelineSync()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal pipeline error:', err);
      process.exit(1);
    });
}
