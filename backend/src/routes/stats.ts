import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

/**
 * GET /api/stats
 * Dataset statistics for the homepage.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [materialsRes, productsRes, variantsRes, commonRes, coverageRes] = await Promise.all([
      supabase.from('materials').select('*', { count: 'exact', head: true }),
      supabase.from('supplier_products').select('*', { count: 'exact', head: true }),
      supabase.from('product_variants').select('*', { count: 'exact', head: true }),
      supabase.from('common_materials_view').select('*', { count: 'exact', head: true }),
      supabase.from('supplier_coverage_summary').select('*'),
    ]);

    const timestamp = new Date().toISOString();
    return res.json({
      // Frontend PlatformStats contract
      totalMaterials: materialsRes.count || 0,
      totalSupplierProducts: productsRes.count || 0,
      totalVariants: variantsRes.count || 0,
      commonMaterials: commonRes.count || 0,
      lastUpdatedAt: timestamp,

      // Backward compatibility fields
      materials: materialsRes.count || 0,
      supplierProducts: productsRes.count || 0,
      variants: variantsRes.count || 0,
      supplierCoverage: coverageRes.data || [],
      generatedAt: timestamp,
    });
  } catch (err) {
    console.error('[Stats] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

export default router;
