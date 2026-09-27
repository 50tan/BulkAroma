import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CrawlService } from '../services/crawl.service';

const router = Router();
const crawlService = new CrawlService();

const CrawlRequestSchema = z.object({
  supplier: z.enum(['psh', 'fraterworks', 'pa', 'all']).default('all'),
  maxPages: z.number().int().positive().optional(),
  testMode: z.boolean().optional(),
});

/**
 * POST /api/crawl
 * Trigger a background crawl for suppliers.
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = CrawlRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  const { supplier, maxPages, testMode } = parsed.data;

  try {
    const runs = await crawlService.startCrawl(supplier, { maxPages, testMode });
    return res.status(202).json({
      success: true,
      message: `Crawl initiated for ${supplier}`,
      jobId: runs[0]?.id,
      runs,
    });
  } catch (err: any) {
    console.error('[Crawl Route] Error starting crawl:', err);
    return res.status(500).json({
      error: 'Failed to start crawl',
      message: err.message,
    });
  }
});

/**
 * GET /api/crawl/status/:jobId
 * Check progress and errors of a specific crawl run.
 */
router.get('/status/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  try {
    const result = await crawlService.getStatus(jobId);
    if (!result) {
      return res.status(404).json({ error: 'Crawl job not found' });
    }
    return res.json(result);
  } catch (err: any) {
    console.error('[Crawl Route] Error checking status:', err);
    return res.status(500).json({ error: 'Failed to check crawl status' });
  }
});

/**
 * GET /api/crawl
 * List recent crawl jobs.
 */
router.get('/', async (req: Request, res: Response) => {
  const supplier = req.query.supplier as string | undefined;
  const limit = Math.min(100, parseInt(req.query.limit as string || '20', 10));

  try {
    const runs = await crawlService.getRecent(supplier, limit);
    return res.json({ runs });
  } catch (err: any) {
    console.error('[Crawl Route] Error listing crawl runs:', err);
    return res.status(500).json({ error: 'Failed to fetch crawl runs' });
  }
});

export default router;
