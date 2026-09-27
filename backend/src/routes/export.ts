import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { supabase } from '../config/supabase';
import { ExportService } from '../services/export.service';
import { env } from '../config/env';

const router = Router();
const exportService = new ExportService();

function formatJob(job: any) {
  return {
    ...job,
    // Add camelCase aliases for frontend compatibility if needed
    jobType: job.job_type,
    fileUrl: job.file_url,
    fileName: job.file_name,
    rowCount: job.row_count,
    errorMessage: job.error_message,
    requestedBy: job.requested_by,
    startedAt: job.started_at,
    completedAt: job.completed_at,
    createdAt: job.created_at,
  };
}

/**
 * POST /api/export
 * Universal export trigger (called by frontend requestExport).
 */
router.post('/', async (req: Request, res: Response) => {
  const { type = 'complete_workbook' } = req.body;

  try {
    const { data: job, error: jobError } = await supabase
      .from('export_jobs')
      .insert({
        job_type: type,
        status: 'pending',
        requested_by: null,
      })
      .select()
      .single();

    if (jobError || !job) {
      return res.status(500).json({ error: 'Failed to create export job' });
    }

    // Start export asynchronously
    exportService.generateCompleteWorkbook(job.id).catch((err: Error) => {
      console.error('[Export] Failed to generate workbook:', err);
    });

    return res.status(202).json(formatJob(job));
  } catch (err: any) {
    console.error('[Export] Error starting export:', err);
    return res.status(500).json({ error: 'Export failed to start', message: err.message });
  }
});

/**
 * POST /api/export/common-materials
 * Trigger an Excel workbook export of all common materials.
 */
router.post('/common-materials', async (_req: Request, res: Response) => {
  try {
    const { data: job, error: jobError } = await supabase
      .from('export_jobs')
      .insert({
        job_type: 'common_materials',
        status: 'pending',
        requested_by: null,
      })
      .select()
      .single();

    if (jobError || !job) {
      return res.status(500).json({ error: 'Failed to create export job' });
    }

    exportService.generateCommonMaterialsWorkbook(job.id).catch((err: Error) => {
      console.error('[Export] Failed to generate workbook:', err);
    });

    return res.json({
      jobId: job.id,
      status: 'pending',
      message: 'Export started. Poll /api/export/jobs/:id for status.',
      job: formatJob(job),
    });
  } catch (err) {
    console.error('[Export] Error:', err);
    return res.status(500).json({ error: 'Export failed to start' });
  }
});

/**
 * POST /api/export/complete-workbook
 * Generate the complete Bulkaroma_Common_Materials.xlsx workbook.
 */
router.post('/complete-workbook', async (_req: Request, res: Response) => {
  try {
    const { data: job, error: jobError } = await supabase
      .from('export_jobs')
      .insert({
        job_type: 'complete_workbook',
        status: 'pending',
        requested_by: null,
      })
      .select()
      .single();

    if (jobError || !job) {
      return res.status(500).json({ error: 'Failed to create export job' });
    }

    exportService.generateCompleteWorkbook(job.id).catch((err: Error) => {
      console.error('[Export] Failed to generate complete workbook:', err);
    });

    return res.json({
      jobId: job.id,
      status: 'pending',
      message: 'Full workbook export started. Poll /api/export/jobs/:id for status.',
      job: formatJob(job),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Export failed to start' });
  }
});

/**
 * GET /api/export/download/:id
 * Stream or redirect to download the generated workbook.
 */
router.get('/download/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data: job, error } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !job) {
      return res.status(404).json({ error: 'Export job not found' });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({ error: `Job is not ready (status: ${job.status})` });
    }

    // If file_url is an external or signed URL, redirect
    if (job.file_url && (job.file_url.startsWith('http://') || job.file_url.startsWith('https://'))) {
      return res.redirect(job.file_url);
    }

    // Try downloading from Supabase Storage
    const bucketName = env.exportBucket || 'exports';
    const fileName = job.file_name || 'Bulkaroma_Common_Materials.xlsx';
    const storagePath = `workbooks/${fileName}`;

    const { data: storageFile, error: storageErr } = await supabase.storage
      .from(bucketName)
      .download(storagePath);

    if (!storageErr && storageFile) {
      const arrayBuffer = await storageFile.arrayBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(Buffer.from(arrayBuffer));
    }

    // Fallback: check local tmp
    const localPath = path.join(os.tmpdir(), 'bulkaroma-exports', fileName);
    if (fs.existsSync(localPath)) {
      return res.download(localPath, fileName);
    }

    return res.status(404).json({ error: 'Export file not found or expired' });
  } catch (err: any) {
    console.error('[Export Download] Error:', err);
    return res.status(500).json({ error: 'Failed to download file' });
  }
});

/**
 * GET /api/export/jobs/:id
 * Check export job status and get download URL.
 */
router.get('/jobs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data: job, error } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !job) {
      return res.status(404).json({ error: 'Export job not found' });
    }

    const formatted = formatJob(job);
    return res.json({ job: formatted, ...formatted });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

/**
 * GET /api/export/jobs
 * List recent export jobs.
 */
router.get('/jobs', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('export_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch jobs' });
    }

    return res.json({ jobs: (data || []).map(formatJob) });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * GET /api/export/:id
 * Alternate status lookup used by frontend getExportJob.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data: job, error } = await supabase
      .from('export_jobs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !job) {
      return res.status(404).json({ error: 'Export job not found' });
    }

    const formatted = formatJob(job);
    return res.json(formatted);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

export default router;
