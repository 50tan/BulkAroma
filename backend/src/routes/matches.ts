import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';

const router = Router();

const MatchResolveSchema = z.object({
  sourceProductId: z.string().uuid(),
  targetMaterialId: z.string().uuid(),
  decision: z.enum(['same_material', 'different_material']),
  reason: z.string().optional(),
});

/**
 * POST /api/matches/resolve
 * Resolve a material match decision.
 */
router.post('/resolve', async (req: Request, res: Response) => {
  const parsed = MatchResolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const { sourceProductId, targetMaterialId, decision, reason } = parsed.data;

  try {
    const { error: overrideError } = await supabase
      .from('user_match_overrides')
      .upsert({
        source_product_id: sourceProductId,
        target_material_id: targetMaterialId,
        decision,
        reason: reason || null,
        user_id: null,
      });

    if (overrideError) {
      return res.status(500).json({ error: 'Failed to save match override' });
    }

    if (decision === 'same_material') {
      await supabase
        .from('supplier_products')
        .update({ canonical_material_id: targetMaterialId })
        .eq('id', sourceProductId);
    } else {
      await supabase
        .from('supplier_products')
        .update({ canonical_material_id: null })
        .eq('id', sourceProductId);
    }

    return res.json({ message: 'Match decision saved', decision });
  } catch (err: any) {
    console.error('[Matches/resolve] Error:', err);
    return res.status(500).json({ error: 'Failed to resolve match', message: err.message });
  }
});

/**
 * GET /api/matches
 * Paginated list of match mappings.
 */
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const pageSize = Math.min(100, parseInt(req.query.pageSize as string || '20', 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const { data, count, error } = await supabase
      .from('match_mappings')
      .select('*, supplier_products(original_name, supplier), materials(canonical_name)', { count: 'exact' })
      .range(from, to)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch matches' });
    }

    const formatted = (data || []).map((m: any) => ({
      id: m.id,
      materialId: m.target_material_id || m.material_id,
      materialName: m.materials?.canonical_name || 'Unknown',
      supplier: m.supplier_products?.supplier || 'psh',
      supplierProductName: m.supplier_products?.original_name || 'Unknown',
      confidence: m.confidence || 0,
      status: m.match_type === 'exact' ? 'verified' : 'auto',
      casMatch: m.matching_evidence?.casMatch ?? null,
      nameScore: m.confidence || null,
      createdAt: m.created_at,
    }));

    return res.json({
      data: formatted,
      total: count || 0,
      page,
      pageSize,
      totalPages: Math.ceil((count || 0) / pageSize),
    });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

/**
 * PATCH /api/matches/:id/verify
 */
router.patch('/:id/verify', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data: mapping } = await supabase.from('match_mappings').select('*').eq('id', id).single();
    if (mapping) {
      await supabase
        .from('supplier_products')
        .update({ canonical_material_id: mapping.target_material_id })
        .eq('id', mapping.source_product_id);
    }
    return res.json({ id, status: 'verified' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to verify match' });
  }
});

/**
 * PATCH /api/matches/:id/reject
 */
router.patch('/:id/reject', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const { data: mapping } = await supabase.from('match_mappings').select('*').eq('id', id).single();
    if (mapping) {
      await supabase
        .from('supplier_products')
        .update({ canonical_material_id: null })
        .eq('id', mapping.source_product_id);
    }
    return res.json({ id, status: 'rejected' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reject match' });
  }
});

export default router;
