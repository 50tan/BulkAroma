import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { ExportService } from '../services/export.service';
import { adminAuth } from '../middleware/auth';

const router = Router();
const exportService = new ExportService();

/**
 * POST /api/export/common-materials
 * Trigger an Excel workbook export of all common materials.
 */
router.post('/common-materials', adminAuth, async (req: Request, res: Response) => {
  try {
    // Create export job record
    const { data: job, error: jobError } = await supabase
      .from('export_jobs')
      .insert({
        job_type: 'common_materials',
        status: 'pending',
        requested_by: null, // TODO: set from auth context when auth is enabled
      })
      .select()
      .single();

    if (jobError || !job) {
      return res.status(500).json({ error: 'Failed to create export job' });
    }

    // Start export asynchronously
    exportService.generateCommonMaterialsWorkbook(job.id).catch((err: Error) => {
      console.error('[Export] Failed to generate workbook:', err);
    });

    return res.json({
      jobId: job.id,
      status: 'pending',
      message: 'Export started. Poll /api/export/jobs/:id for status.',
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
router.post('/complete-workbook', adminAuth, async (_req: Request, res: Response) => {
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
    });
  } catch (err) {
    return res.status(500).json({ error: 'Export failed to start' });
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

    return res.json({ job });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch job status' });
  }
});

/**
 * GET /api/export/jobs
 * List recent export jobs.
 */
router.get('/jobs', adminAuth, async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('export_jobs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch jobs' });
    }

    return res.json({ jobs: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

export default router;
