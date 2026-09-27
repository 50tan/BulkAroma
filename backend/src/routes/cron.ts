import { Router, Request, Response } from 'express';
import { env } from '../config/env';
import { CurrencyService } from '../services/currency.service';
import { supabase } from '../config/supabase';

const router = Router();
const currencyService = new CurrencyService();

/**
 * GET /api/cron/refresh-suppliers
 * Triggered periodically by Vercel Cron to refresh currency rates and supplier health.
 */
router.get('/refresh-suppliers', async (req: Request, res: Response) => {
  // Verify Cron Secret if configured
  if (env.cronSecret) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${env.cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized: Invalid cron secret' });
    }
  }

  const startTime = Date.now();
  console.log('[Cron] Starting scheduled supplier refresh task...');

  try {
    // 1. Refresh exchange rates
    await currencyService.refreshRates('USD').catch((err: any) => {
      console.warn('[Cron] Currency refresh warning:', err?.message || err);
    });

    // 2. Fetch coverage summary
    const { data: coverage } = await supabase.from('supplier_coverage_summary').select('*');

    const durationMs = Date.now() - startTime;
    console.log(`[Cron] Completed scheduled refresh in ${durationMs}ms`);

    return res.json({
      success: true,
      message: 'Scheduled refresh completed successfully',
      timestamp: new Date().toISOString(),
      durationMs,
      coverageSummary: coverage || [],
    });
  } catch (err: any) {
    console.error('[Cron] Refresh error:', err);
    return res.status(500).json({
      error: 'Scheduled refresh failed',
      message: err.message,
    });
  }
});

export default router;
