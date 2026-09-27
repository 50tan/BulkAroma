import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

/**
 * GET /api/search?q=iso+e+super
 * Search for materials by name, CAS, alias, or supplier product name.
 */
router.get('/', async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }
  if (q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const { data, error } = await supabase.rpc('search_materials', {
      search_query: q,
    });

    if (error) {
      console.error('[Search] Supabase error:', error);
      return res.status(500).json({ error: 'Search failed', details: error.message });
    }

    // Deduplicate by material_id (function may return same material via multiple paths)
    const seen = new Set<string>();
    const results = (data || []).filter((r: { material_id: string }) => {
      if (seen.has(r.material_id)) return false;
      seen.add(r.material_id);
      return true;
    });

    return res.json({
      query: q,
      results,
      count: results.length,
    });
  } catch (err) {
    console.error('[Search] Unexpected error:', err);
    return res.status(500).json({ error: 'Search failed' });
  }
});

export default router;
