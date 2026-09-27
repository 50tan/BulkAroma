import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

import fs from 'fs';
import { supabase } from '../config/supabase';
import { ExportService } from '../services/export.service';

async function main() {
  console.log('\n======================================================');
  console.log('Bulkaroma — Generating Master 8-Sheet Excel Export');
  console.log('======================================================\n');

  // Create an export job in Supabase
  const { data: job, error: jobErr } = await supabase
    .from('export_jobs')
    .insert({
      job_type: 'complete_workbook',
      status: 'pending',
    })
    .select('id')
    .single();

  const jobId = job?.id || 'manual-' + Date.now();
  console.log(`Starting export job: ${jobId}`);

  const exportService = new ExportService();
  const filePath = await exportService.generateCompleteWorkbook(jobId);

  console.log('\n======================================================');
  console.log('Excel Export Generated Successfully!');
  console.log('======================================================');
  console.log(`File Path: ${filePath}`);

  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`File Size: ${(stats.size / 1024).toFixed(2)} KB`);
  } else {
    console.warn('Warning: File was not found on disk at expected path.');
  }
}

main().catch((err) => {
  console.error('Fatal export error:', err);
  process.exit(1);
});
