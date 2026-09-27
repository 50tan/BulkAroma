import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CrawlService } from '../services/crawl.service';

const router = Router();
const crawlService = new CrawlService();

function formatCrawlJob(run: any, errors: any[] = []): any {
  return {
    id: run.id,
    supplier: run.supplier === 'psh' ? 'PSH' : run.supplier === 'fraterworks' ? 'Fraterworks' : run.supplier === 'pa' ? 'PA' : run.supplier,
    status: run.status === 'running' ? 'running' : run.status === 'completed' ? 'completed' : 'failed',
    startedAt: run.started_at,
    completedAt: run.completed_at,
    productsFound: run.products_found || 0,
    productsProcessed: run.products_updated || run.products_found || 0,
    estimatedTotal: null,
    errors: errors.map((e: any) => `${e.error_type}: ${e.error_message}`),
    // Backward compatibility
    run,
  };
}

const CrawlRequestSchema = z.object({
  supplier: z.string().default('all'),
  maxPages: z.number().int().positive().optional(),
  testMode: z.boolean().optional(),
});

/**
 * POST /api/crawl
 * Triggers a bounded crawl, fully awaiting execution before responding.
 * Eliminates detached background promise drops in serverless environments.
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = CrawlRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  const rawSupplier = parsed.data.supplier.toLowerCase();
  const validSuppliers = ['psh', 'fraterworks', 'pa', 'all'];
  const supplier = (validSuppliers.includes(rawSupplier) ? rawSupplier : 'all') as 'psh' | 'fraterworks' | 'pa' | 'all';
  const { maxPages = 1, testMode = false } = parsed.data;

  try {
    // 100% synchronous & awaited within serverless function execution budget
    const runs = await crawlService.runBoundedCrawl(supplier, { maxPages, testMode });
    const primary = runs[0];
    const formatted = formatCrawlJob(primary);

    return res.status(200).json({
      ...formatted,
      runs: runs.map((r) => formatCrawlJob(r)),
      message: `Crawl completed for ${supplier}`,
    });
  } catch (err: any) {
    console.error('[Crawl Route] Error during crawl execution:', err);
    return res.status(500).json({
      error: 'Crawl execution failed',
      message: err.message,
    });
  }
});

/**
 * POST /api/crawl/step
 * Atomic page/chunk step. Crawls a single page or batch, persisting progress before return.
 */
router.post('/step', async (req: Request, res: Response) => {
  const rawSupplier = (req.body.supplier || 'psh').toLowerCase();
  const valid = ['psh', 'fraterworks', 'pa'];
  const supplier = (valid.includes(rawSupplier) ? rawSupplier : 'psh') as 'psh' | 'fraterworks' | 'pa';
  const page = Math.max(1, parseInt(req.body.page || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(req.body.pageSize || '25', 10)));
  const jobId = req.body.jobId;

  try {
    const stepResult = await crawlService.crawlStep({ supplier, page, pageSize, jobId });
    return res.json(stepResult);
  } catch (err: any) {
    console.error('[Crawl Step Route] Error:', err);
    return res.status(500).json({ error: 'Step crawl failed', message: err.message });
  }
});

/**
 * GET /api/crawl/status/:jobId & GET /api/crawl/:jobId
 */
const getStatusHandler = async (req: Request, res: Response) => {
  const { jobId, id } = req.params;
  const targetId = jobId || id;

  try {
    const result = await crawlService.getStatus(targetId);
    if (!result) {
      return res.status(404).json({ error: 'Crawl job not found' });
    }
    const formatted = formatCrawlJob(result.run, result.errors);
    return res.json({
      ...formatted,
      run: result.run,
      errors: result.errors,
    });
  } catch (err: any) {
    console.error('[Crawl Route] Error checking status:', err);
    return res.status(500).json({ error: 'Failed to check crawl status' });
  }
};

router.get('/status/:jobId', getStatusHandler);
router.get('/:id', getStatusHandler);

/**
 * GET /api/crawl
 * List recent crawl jobs.
 */
router.get('/', async (req: Request, res: Response) => {
  const supplier = req.query.supplier as string | undefined;
  const limit = Math.min(100, parseInt(req.query.limit as string || '20', 10));

  try {
    const runs = await crawlService.getRecent(supplier, limit);
    const formatted = runs.map((r) => formatCrawlJob(r));
    return res.json({ runs: formatted });
  } catch (err: any) {
    console.error('[Crawl Route] Error listing crawl runs:', err);
    return res.status(500).json({ error: 'Failed to fetch crawl runs' });
  }
});

export default router;
