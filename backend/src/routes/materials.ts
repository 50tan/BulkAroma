import { Router, Request, Response } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

export type SupplierCode = 'PSH' | 'Fraterworks' | 'PA';

export type CoverageTier =
  | 'COMMON_ALL_3'
  | 'COMMON_PSH_FRATERWORKS'
  | 'COMMON_PSH_PA'
  | 'COMMON_FRATERWORKS_PA'
  | 'SINGLE_PSH'
  | 'SINGLE_FRATERWORKS'
  | 'SINGLE_PA'
  | 'SINGLE_SUPPLIER';

export interface CommonMaterialResponse {
  id: string;
  name: string;
  casNumber: string | null;
  category: string | null;
  supplierNames: Record<SupplierCode, string | null>;
  supplierCount?: number;
  coverageTier?: CoverageTier;
  matchConfidence: number;
  variantCount: number;
  updatedAt: string;
}

export function formatCommonMaterial(mat: any): CommonMaterialResponse {
  const supplierNames: Record<SupplierCode, string | null> = {
    PSH: null,
    Fraterworks: null,
    PA: null,
  };

  let variantCount = 0;

  if (Array.isArray(mat.supplier_products)) {
    for (const sp of mat.supplier_products) {
      const s = (sp.supplier || '').toLowerCase();
      if (s === 'psh') {
        supplierNames.PSH = sp.original_name || 'Available';
      } else if (s === 'fraterworks') {
        supplierNames.Fraterworks = sp.original_name || 'Available';
      } else if (s === 'pa') {
        supplierNames.PA = sp.original_name || 'Available';
      }

      if (Array.isArray(sp.product_variants)) {
        variantCount += sp.product_variants.length;
      }
    }
  }

  // Fallbacks if coming from common_materials_view
  if (mat.available_at_psh && !supplierNames.PSH) {
    supplierNames.PSH = 'Available';
  }
  if (mat.available_at_fraterworks && !supplierNames.Fraterworks) {
    supplierNames.Fraterworks = 'Available';
  }
  if (mat.available_at_pa && !supplierNames.PA) {
    supplierNames.PA = 'Available';
  }
  if (mat.total_variants && !variantCount) {
    variantCount = Number(mat.total_variants);
  }

  const activeCount = Object.values(supplierNames).filter(Boolean).length;
  let coverageTier: CoverageTier = 'SINGLE_SUPPLIER';
  if (activeCount >= 3) {
    coverageTier = 'COMMON_ALL_3';
  } else if (activeCount === 2) {
    if (supplierNames.PSH && supplierNames.Fraterworks) coverageTier = 'COMMON_PSH_FRATERWORKS';
    else if (supplierNames.PSH && supplierNames.PA) coverageTier = 'COMMON_PSH_PA';
    else if (supplierNames.Fraterworks && supplierNames.PA) coverageTier = 'COMMON_FRATERWORKS_PA';
  } else if (activeCount === 1) {
    if (supplierNames.PSH) coverageTier = 'SINGLE_PSH';
    else if (supplierNames.Fraterworks) coverageTier = 'SINGLE_FRATERWORKS';
    else if (supplierNames.PA) coverageTier = 'SINGLE_PA';
  }

  return {
    id: mat.id,
    name: mat.canonical_name || mat.name || '',
    casNumber: mat.cas_number || mat.casNumber || null,
    category: mat.category || null,
    supplierNames,
    supplierCount: activeCount,
    coverageTier,
    matchConfidence: 1.0,
    variantCount,
    updatedAt: mat.updated_at || mat.last_price_update || new Date().toISOString(),
  };
}

/**
 * Shared handler for fetching common materials (available across suppliers).
 */
export async function handleGetCommonMaterials(_req: Request, res: Response) {
  try {
    const { data: materialsData, error: matError } = await supabase
      .from('materials')
      .select(`
        id,
        canonical_name,
        normalized_name,
        cas_number,
        chemical_name,
        category,
        description,
        updated_at,
        supplier_products (
          id,
          supplier,
          original_name,
          product_variants (
            id
          )
        )
      `)
      .order('canonical_name');

    if (matError) {
      console.error('[Common Materials] Error:', matError);
      return res.status(500).json({ error: 'Failed to fetch common materials', details: matError.message });
    }

    const allFormatted = (materialsData || []).map(formatCommonMaterial);
    // Filter for materials available at 2 or more suppliers (common materials)
    const common = allFormatted.filter((m) => {
      const activeCount = Object.values(m.supplierNames).filter(Boolean).length;
      return activeCount >= 2;
    });

    // If few common materials found, return all available materials
    const result = common.length > 0 ? common : allFormatted;
    return res.json(result);
  } catch (err) {
    console.error('[Common Materials] Unexpected error:', err);
    return res.status(500).json({ error: 'Failed to fetch common materials' });
  }
}

/**
 * 1. GET /api/materials
 * Paginated list of all materials matching PaginatedResponse<CommonMaterial>.
 *
 * Contract:
 * {
 *   data: CommonMaterial[],
 *   total: number,
 *   page: number,
 *   pageSize: number,
 *   totalPages: number
 * }
 */
router.get('/', async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, parseInt((req.query.pageSize as string) || (req.query.limit as string) || '50', 10))
  );
  const offset = (page - 1) * pageSize;
  const category = req.query.category as string | undefined;
  const search = ((req.query.search as string) || (req.query.q as string) || '').trim();
  const hasCas = req.query.hasCas;
  const suppliersParam = ((req.query.suppliers as string) || (req.query.supplier as string) || '').trim();
  const coverage = ((req.query.coverage as string) || (req.query.tier as string) || '').trim().toLowerCase();
  const sort = ((req.query.sort as string) || 'name').toLowerCase();
  const direction = ((req.query.direction as string) || (req.query.dir as string) || 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

  try {
    let query = supabase
      .from('materials')
      .select(`
        id,
        canonical_name,
        normalized_name,
        cas_number,
        chemical_name,
        category,
        description,
        updated_at,
        supplier_products (
          id,
          supplier,
          original_name,
          product_variants (
            id
          )
        )
      `, { count: 'exact' });

    if (category) {
      query = query.eq('category', category);
    }

    if (search) {
      query = query.or(`canonical_name.ilike.%${search}%,cas_number.ilike.%${search}%,normalized_name.ilike.%${search}%`);
    }

    if (hasCas === 'true') {
      query = query.not('cas_number', 'is', null);
    } else if (hasCas === 'false') {
      query = query.is('cas_number', null);
    }

    // Apply DB-level sorting where applicable
    if (sort === 'name') {
      query = query.order('canonical_name', { ascending: direction === 'asc' });
    } else if (sort === 'category') {
      query = query.order('category', { ascending: direction === 'asc', nullsFirst: false });
    } else if (sort === 'updatedat' || sort === 'updated_at') {
      query = query.order('updated_at', { ascending: direction === 'asc' });
    } else {
      query = query.order('canonical_name', { ascending: direction === 'asc' });
    }

    const { data: rawData, error, count } = await query;
    if (error) {
      console.error('[Materials] DB Query error:', error);
      return res.status(500).json({ error: 'Failed to fetch materials', details: error.message });
    }

    let formatted = (rawData || []).map(formatCommonMaterial);

    // Filter by supplier availability if requested (e.g. suppliers=PSH,Fraterworks)
    if (suppliersParam) {
      const requiredSuppliers = suppliersParam
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      if (requiredSuppliers.length > 0) {
        formatted = formatted.filter((m) => {
          return requiredSuppliers.every((reqSup) => {
            if (reqSup === 'psh') return !!m.supplierNames.PSH;
            if (reqSup === 'fraterworks' || reqSup === 'fw') return !!m.supplierNames.Fraterworks;
            if (reqSup === 'pa') return !!m.supplierNames.PA;
            return false;
          });
        });
      }
    }

    // Filter by coverage tier if requested
    if (coverage && coverage !== 'all') {
      formatted = formatted.filter((m) => {
        const count = m.supplierCount ?? Object.values(m.supplierNames).filter(Boolean).length;
        const hasPSH = !!m.supplierNames.PSH;
        const hasFW = !!m.supplierNames.Fraterworks;
        const hasPA = !!m.supplierNames.PA;

        if (coverage === 'all_3' || coverage === 'all3') return count >= 3;
        if (coverage === 'any_2' || coverage === 'any2') return count >= 2;
        if (coverage === 'exactly_2' || coverage === 'exact2') return count === 2;
        if (coverage === 'psh_fraterworks') return hasPSH && hasFW && !hasPA;
        if (coverage === 'psh_pa') return hasPSH && hasPA && !hasFW;
        if (coverage === 'fraterworks_pa') return hasFW && hasPA && !hasPSH;
        if (coverage === 'psh_only') return hasPSH && !hasFW && !hasPA;
        if (coverage === 'fraterworks_only') return hasFW && !hasPSH && !hasPA;
        if (coverage === 'pa_only') return hasPA && !hasPSH && !hasFW;
        return true;
      });
    }

    // Sort by supplierCount if requested
    if (sort === 'suppliercount') {
      formatted.sort((a, b) => {
        const countA = Object.values(a.supplierNames).filter(Boolean).length;
        const countB = Object.values(b.supplierNames).filter(Boolean).length;
        return direction === 'asc' ? countA - countB : countB - countA;
      });
    }

    const total = count != null && !suppliersParam && (!coverage || coverage === 'all') ? count : formatted.length;
    const paginated = formatted.slice(offset, offset + pageSize);
    const totalPages = Math.ceil(total / pageSize) || 1;

    return res.json({
      data: paginated,
      total,
      page,
      pageSize,
      totalPages,
    });
  } catch (err) {
    console.error('[Materials] Unexpected error:', err);
    return res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

/**
 * 2. Static route: GET /api/materials/coverage-stats
 * Real-time breakdown of materials across supplier intersection tiers.
 */
router.get('/coverage-stats', async (_req: Request, res: Response) => {
  try {
    const { data: materialsData, error: matError } = await supabase
      .from('materials')
      .select(`
        id,
        supplier_products (
          supplier
        )
      `);

    if (matError) {
      return res.status(500).json({ error: 'Failed to fetch coverage stats', details: matError.message });
    }

    let total = 0;
    let all3 = 0;
    let any2 = 0;
    let pshFraterworks = 0;
    let pshPa = 0;
    let fraterworksPa = 0;
    let pshOnly = 0;
    let fraterworksOnly = 0;
    let paOnly = 0;

    for (const m of (materialsData || [])) {
      total++;
      const sups = new Set((m.supplier_products || []).map((sp: any) => (sp.supplier || '').toLowerCase()));
      const hasPSH = sups.has('psh');
      const hasFW = sups.has('fraterworks');
      const hasPA = sups.has('pa');

      if (hasPSH && hasFW && hasPA) {
        all3++;
        any2++;
      } else if (hasPSH && hasFW) {
        pshFraterworks++;
        any2++;
      } else if (hasPSH && hasPA) {
        pshPa++;
        any2++;
      } else if (hasFW && hasPA) {
        fraterworksPa++;
        any2++;
      } else if (hasPSH) {
        pshOnly++;
      } else if (hasFW) {
        fraterworksOnly++;
      } else if (hasPA) {
        paOnly++;
      }
    }

    return res.json({
      total,
      all3,
      any2,
      exactly2: any2 - all3,
      pshFraterworks,
      pshPa,
      fraterworksPa,
      pshOnly,
      fraterworksOnly,
      paOnly,
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to calculate coverage stats', details: err?.message });
  }
});

/**
 * 2. Static route: GET /api/materials/common
 * (Must be defined BEFORE /:id so it is never captured as an ID)
 */
router.get('/common', handleGetCommonMaterials);

/**
 * 3. Dynamic route: GET /api/materials/:id
 * Single material detail matching frontend Material interface.
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const [materialRes, aliasesRes, productsRes] = await Promise.all([
      supabase.from('materials').select('*').eq('id', id).single(),
      supabase.from('material_aliases').select('*').eq('material_id', id).order('confidence', { ascending: false }),
      supabase.from('supplier_products').select('*, product_variants(*, price_observations(price_amount, currency, original_price_text, observed_at, source_url, availability))').eq('canonical_material_id', id).order('supplier'),
    ]);

    if (materialRes.error || !materialRes.data) {
      return res.status(404).json({ error: 'Material not found' });
    }

    const mat = materialRes.data;
    const products = productsRes.data || [];

    const suppliersAvailableSet = new Set<SupplierCode>();
    let variantCount = 0;

    for (const p of products) {
      const s = (p.supplier || '').toLowerCase();
      if (s === 'psh') suppliersAvailableSet.add('PSH');
      else if (s === 'fraterworks') suppliersAvailableSet.add('Fraterworks');
      else if (s === 'pa') suppliersAvailableSet.add('PA');

      if (Array.isArray(p.product_variants)) {
        variantCount += p.product_variants.length;
      }
    }

    return res.json({
      id: mat.id,
      name: mat.canonical_name,
      casNumber: mat.cas_number || null,
      chemicalName: mat.chemical_name || null,
      category: mat.category || null,
      description: mat.description || null,
      suppliersAvailable: Array.from(suppliersAvailableSet),
      variantCount,
      updatedAt: mat.updated_at || new Date().toISOString(),
      // Backward compatibility fields
      material: mat,
      aliases: aliasesRes.data || [],
      supplier_products: products,
    });
  } catch (err) {
    console.error('[Materials/:id] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch material' });
  }
});

/**
 * 4. GET /api/materials/:id/variants
 * All variants for a material with latest prices.
 */
router.get('/:id/variants', async (req: Request, res: Response) => {
  const { id } = req.params;

  try {
    const { data, error } = await supabase
      .from('current_supplier_prices')
      .select('*')
      .eq('material_id', id)
      .order('supplier')
      .order('quantity');

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch variants', details: error.message });
    }

    return res.json({ variants: data || [] });
  } catch (err) {
    console.error('[Materials/:id/variants] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch variants' });
  }
});

/**
 * 5. GET /api/materials/:id/history
 * Price history for a material.
 */
router.get('/:id/history', async (req: Request, res: Response) => {
  const { id } = req.params;
  const days = parseInt((req.query.days as string) || '90', 10);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  try {
    const { data, error } = await supabase
      .from('price_history_view')
      .select('*')
      .eq('material_id', id)
      .gte('observed_at', since)
      .order('observed_at', { ascending: true });

    if (error) {
      // Fallback through product_variants join
      const { data: altData, error: altError } = await supabase
        .from('price_observations')
        .select(`
          price_amount, currency, observed_at, source_url,
          product_variants!inner(
            quantity, unit, variant_name,
            supplier_products!inner(
              original_name, supplier,
              canonical_material_id
            )
          )
        `)
        .eq('product_variants.supplier_products.canonical_material_id', id)
        .gte('observed_at', since)
        .order('observed_at', { ascending: true });

      if (altError) {
        return res.status(500).json({ error: 'Failed to fetch price history' });
      }

      const points = (altData || []).map((row: any) => {
        const s = (row.product_variants?.supplier_products?.supplier || '').toLowerCase();
        const supCode: SupplierCode = s === 'fraterworks' ? 'Fraterworks' : s === 'pa' ? 'PA' : 'PSH';
        const qtyG = row.product_variants?.quantity || 1;
        const pricePerHundredGrams = (Number(row.price_amount) / qtyG) * 100;
        return {
          date: row.observed_at,
          supplier: supCode,
          pricePerHundredGrams,
          currency: row.currency,
          convertedPrice: null,
        };
      });

      return res.json(points);
    }

    const points = (data || []).map((row: any) => {
      const s = (row.supplier || '').toLowerCase();
      const supCode: SupplierCode = s === 'fraterworks' ? 'Fraterworks' : s === 'pa' ? 'PA' : 'PSH';
      const qtyG = Number(row.quantity) || 1;
      const pricePerHundredGrams = (Number(row.price_amount) / qtyG) * 100;
      return {
        date: row.observed_at,
        supplier: supCode,
        pricePerHundredGrams,
        currency: row.currency,
        convertedPrice: null,
      };
    });

    return res.json(points);
  } catch (err) {
    console.error('[Materials/:id/history] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch price history' });
  }
});

export default router;
