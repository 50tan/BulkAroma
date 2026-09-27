import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { CrawlService } from '../services/crawl.service';

const router = Router();
const crawlService = new CrawlService();

const RefreshSchema = z.object({
  url: z.string().url(),
});

/**
 * POST /api/scrape/refresh
 * Single-product fast refresh.
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const parsed = RefreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid request body',
      details: parsed.error.flatten(),
    });
  }

  const { url } = parsed.data;

  try {
    const result = await crawlService.refreshProduct(url);
    return res.json({
      success: true,
      message: 'Product refreshed successfully',
      data: result,
    });
  } catch (err: any) {
    console.error('[Scrape Route] Refresh error:', err);
    return res.status(500).json({
      error: 'Failed to refresh product',
      message: err.message,
    });
  }
});

export default router;
