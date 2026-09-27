import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { adminAuth } from '../middleware/auth';

const router = Router();

/**
 * GET /api/admin/data-health
 * Supplier coverage and data quality summary.
 */
router.get('/data-health', adminAuth, async (_req: Request, res: Response) => {
  try {
    const [coverageRes, qualityRes] = await Promise.all([
      supabase.from('supplier_coverage_summary').select('*'),
      supabase.from('data_quality_summary').select('*'),
    ]);

    return res.json({
      coverage: coverageRes.data || [],
      quality: qualityRes.data || [],
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Admin/data-health] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch data health' });
  }
});

/**
 * GET /api/admin/scrape-runs
 * Recent scrape runs.
 */
router.get('/scrape-runs', adminAuth, async (req: Request, res: Response) => {
  const supplier = req.query.supplier as string | undefined;
  const limit = Math.min(100, parseInt(req.query.limit as string || '20', 10));

  try {
    let query = supabase
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (supplier) {
      query = query.eq('supplier', supplier);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch scrape runs' });
    }

    return res.json({ scrapeRuns: data || [] });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch scrape runs' });
  }
});

/**
 * GET /api/admin/scrape-runs/:id
 * Single scrape run status and errors.
 */
router.get('/scrape-runs/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [runRes, errorsRes] = await Promise.all([
      supabase.from('scrape_runs').select('*').eq('id', id).single(),
      supabase.from('crawl_errors').select('*').eq('scrape_run_id', id).order('created_at', { ascending: false }).limit(100),
    ]);

    if (!runRes.data) {
      return res.status(404).json({ error: 'Scrape run not found' });
    }

    return res.json({
      run: runRes.data,
      errors: errorsRes.data || [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch scrape run' });
  }
});

const CrawlSchema = z.object({
  supplier: z.enum(['psh', 'fraterworks', 'pa', 'all']),
  options: z.object({
    maxPages: z.number().positive().optional(),
    testMode: z.boolean().optional(),
  }).optional(),
});

/**
 * POST /api/admin/crawl
 * Trigger a scraper crawl.
 */
router.post('/crawl', adminAuth, async (req: Request, res: Response) => {
  const parsed = CrawlSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { supplier, options } = parsed.data;

  try {
    // Create scrape run records
    const suppliers = supplier === 'all' ? ['psh', 'fraterworks', 'pa'] : [supplier];
    const runs = await Promise.all(
      suppliers.map(async (s) => {
        const { data } = await supabase
          .from('scrape_runs')
          .insert({ supplier: s, started_at: new Date().toISOString(), status: 'running' })
          .select()
          .single();
        return data;
      })
    );

    // Note: Actual scraping runs as a separate process (npm run scrape:xxx)
    // This endpoint triggers the scraper via a child process in production
    // For now, it returns the created run IDs so the frontend can poll status

    return res.json({
      message: `Crawl initiated for: ${suppliers.join(', ')}`,
      runs: runs.filter(Boolean),
      note: 'Run npm run scrape:' + supplier + ' to execute the actual crawl',
    });
  } catch (err) {
    console.error('[Admin/crawl] Error:', err);
    return res.status(500).json({ error: 'Failed to initiate crawl' });
  }
});

const MatchResolveSchema = z.object({
  sourceProductId: z.string().uuid(),
  targetMaterialId: z.string().uuid(),
  decision: z.enum(['same_material', 'different_material']),
  reason: z.string().optional(),
});

/**
 * POST /api/admin/matches/resolve
 * Resolve a material match decision.
 */
router.post('/matches/resolve', adminAuth, async (req: Request, res: Response) => {
  const parsed = MatchResolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { sourceProductId, targetMaterialId, decision, reason } = parsed.data;

  try {
    // Save user override
    const { error: overrideError } = await supabase
      .from('user_match_overrides')
      .upsert({
        source_product_id: sourceProductId,
        target_material_id: targetMaterialId,
        decision,
        reason: reason || null,
        user_id: null, // Would be set from auth context
      });

    if (overrideError) {
      return res.status(500).json({ error: 'Failed to save match override' });
    }

    // Apply the decision
    if (decision === 'same_material') {
      await supabase
        .from('supplier_products')
        .update({ canonical_material_id: targetMaterialId })
        .eq('id', sourceProductId);
    } else {
      // Clear the canonical material link for this product
      await supabase
        .from('supplier_products')
        .update({ canonical_material_id: null })
        .eq('id', sourceProductId);
    }

    return res.json({ message: 'Match decision saved', decision });
  } catch (err) {
    console.error('[Admin/matches/resolve] Error:', err);
    return res.status(500).json({ error: 'Failed to resolve match' });
  }
});

/**
 * GET /api/admin/unmatched-products
 * Products not yet matched to a canonical material.
 */
router.get('/unmatched-products', adminAuth, async (req: Request, res: Response) => {
  const supplier = req.query.supplier as string | undefined;
  const limit = Math.min(100, parseInt(req.query.limit as string || '50', 10));

  try {
    let query = supabase
      .from('supplier_products')
      .select('*')
      .is('canonical_material_id', null)
      .order('last_seen_at', { ascending: false })
      .limit(limit);

    if (supplier) {
      query = query.eq('supplier', supplier);
    }

    const { data, error } = await query;
    if (error) {
      return res.status(500).json({ error: 'Failed to fetch unmatched products' });
    }

    return res.json({ products: data || [], count: (data || []).length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch unmatched products' });
  }
});

export default router;
