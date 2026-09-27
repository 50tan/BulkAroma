import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { CurrencyService } from '../services/currency.service';

const router = Router();
const currencyService = new CurrencyService();

const MASS_CONVERSIONS: Record<string, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};
const VOLUME_CONVERSIONS: Record<string, number> = {
  ml: 1,
  l: 1000,
  L: 1000,
  fl_oz: 29.5735,
};

function toGrams(qty: number, unit: string): number | null {
  const factor = MASS_CONVERSIONS[unit.toLowerCase()];
  return factor !== undefined ? qty * factor : null;
}
function toMl(qty: number, unit: string): number | null {
  const factor = VOLUME_CONVERSIONS[unit.toLowerCase()];
  return factor !== undefined ? qty * factor : null;
}

function isMassUnit(unit: string): boolean {
  return unit.toLowerCase() in MASS_CONVERSIONS;
}

function calculatePurchase(
  targetQtyNorm: number,
  packageQtyNorm: number,
  listedPrice: number,
  fxRate: number,
  sourceCurrency: string,
  displayCurrency: string,
  targetUnit: string
) {
  if (packageQtyNorm <= 0) return null;
  const packagesRequired = Math.ceil(targetQtyNorm / packageQtyNorm);
  const actualQuantityPurchased = packagesRequired * packageQtyNorm;
  const excessQuantity = actualQuantityPurchased - targetQtyNorm;
  const actualCost = packagesRequired * listedPrice;
  const convertedActualCost = actualCost * fxRate;
  return {
    packagesRequired,
    actualQuantityPurchased,
    actualUnit: targetUnit,
    excessQuantity,
    actualCost,
    actualCostCurrency: sourceCurrency,
    convertedActualCost: Math.round(convertedActualCost * 100) / 100,
    convertedCurrency: displayCurrency,
  };
}

function calculateNormalizedPrices(
  priceAmount: number,
  fxRate: number,
  packageQtyG: number | null,
  packageQtyMl: number | null,
  sourceCurrency: string,
  displayCurrency: string
) {
  const orig100g = packageQtyG ? (priceAmount / packageQtyG) * 100 : null;
  const origKg = packageQtyG ? (priceAmount / packageQtyG) * 1000 : null;
  const orig100ml = packageQtyMl ? (priceAmount / packageQtyMl) * 100 : null;
  const origLiter = packageQtyMl ? (priceAmount / packageQtyMl) * 1000 : null;

  return {
    per100g: orig100g ? orig100g * fxRate : null,
    perKg: origKg ? origKg * fxRate : null,
    per100ml: orig100ml ? orig100ml * fxRate : null,
    perLiter: origLiter ? origLiter * fxRate : null,
    currency: displayCurrency,
    originalPer100g: orig100g,
    originalPerKg: origKg,
    originalPer100ml: orig100ml,
    originalPerLiter: origLiter,
    originalCurrency: sourceCurrency,
  };
}

const CompareSchema = z.object({
  query: z.string().min(1),
  targetQuantity: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  targetUnit: z.string().optional(),
  unit: z.string().optional(),
  displayCurrency: z.string().optional(),
  materialId: z.string().uuid().optional(),
});

function toSupplierCode(raw: string): 'PSH' | 'Fraterworks' | 'PA' {
  const lower = (raw || '').toLowerCase();
  if (lower === 'psh') return 'PSH';
  if (lower === 'fraterworks' || lower === 'fw') return 'Fraterworks';
  if (lower === 'pa') return 'PA';
  return 'PSH';
}

/**
 * POST /api/compare
 * Compare a material across all suppliers for a given quantity and display currency.
 */
router.post('/', async (req: Request, res: Response) => {
  const parsed = CompareSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
  }

  const query = parsed.data.query;
  const targetQuantity = parsed.data.targetQuantity ?? parsed.data.quantity ?? 100;
  const targetUnit = parsed.data.targetUnit ?? parsed.data.unit ?? 'g';
  const displayCurrency = (parsed.data.displayCurrency || 'USD').toUpperCase();
  const materialId = parsed.data.materialId;

  try {
    // 1. Find the material
    let material: any = null;
    if (materialId) {
      const { data } = await supabase.from('materials').select('*').eq('id', materialId).single();
      material = data;
    }
    if (!material) {
      const { data } = await supabase.rpc('search_materials', { search_query: query });
      if (data && data.length > 0) {
        const { data: mat } = await supabase.from('materials').select('*').eq('id', data[0].material_id).single();
        material = mat;
      }
    }
    if (!material) {
      return res.json({
        materialId: '',
        materialName: query,
        casNumber: null,
        category: null,
        suppliers: [],
        priceHistory: [],
        lastFetchedAt: new Date().toISOString(),
        status: 'not_found',
        query,
        targetQuantity,
        targetUnit,
        displayCurrency,
      });
    }

    // 2. Get all current prices for this material
    const { data: priceRows, error: priceError } = await supabase
      .from('current_supplier_prices')
      .select('*')
      .eq('material_id', material.id);

    if (priceError) {
      return res.status(500).json({ error: 'Failed to fetch prices', details: priceError.message });
    }

    // 3. Get aliases
    const { data: aliases } = await supabase
      .from('material_aliases')
      .select('*')
      .eq('material_id', material.id);

    // 4. Normalize target quantity
    const targetMass = isMassUnit(targetUnit) ? toGrams(targetQuantity, targetUnit) : null;
    const targetVolume = !isMassUnit(targetUnit) ? toMl(targetQuantity, targetUnit) : null;

    // 5. Group by supplier
    const supplierGroups: Record<string, any[]> = {};
    for (const row of priceRows || []) {
      const s = row.supplier as string;
      if (!supplierGroups[s]) supplierGroups[s] = [];
      supplierGroups[s].push(row);
    }

    // 6. Build comparison for each supplier
    const suppliers = await Promise.all(
      Object.entries(supplierGroups).map(async ([supplierRaw, rows]) => {
        const firstRow = rows[0] || {};
        const sourceCurrency = firstRow.currency || 'USD';
        const supCode = toSupplierCode(supplierRaw);

        // Get FX rate
        let fxRate = 1;
        try {
          fxRate = await currencyService.getRate(sourceCurrency, displayCurrency);
        } catch {
          fxRate = 1;
        }

        // Build variants
        const variants = (rows as any[])
          .filter((r) => r.price_amount != null)
          .map((r) => {
            const pkgQtyG = r.normalized_quantity_g ? Number(r.normalized_quantity_g) : null;
            const pkgQtyMl = r.normalized_quantity_ml ? Number(r.normalized_quantity_ml) : null;
            const priceAmount = Number(r.price_amount);
            const convertedPrice = priceAmount * fxRate;
            const normalized = calculateNormalizedPrices(priceAmount, fxRate, pkgQtyG, pkgQtyMl, sourceCurrency, displayCurrency);

            const normTarget = targetMass ?? targetVolume ?? targetQuantity;
            const normPkg = (targetMass ? pkgQtyG : targetVolume ? pkgQtyMl : null) ?? Number(r.quantity) ?? 1;

            const purchase = calculatePurchase(normTarget, normPkg, priceAmount, fxRate, sourceCurrency, displayCurrency, targetUnit);

            const pricePerHundredGrams = pkgQtyG ? (convertedPrice / pkgQtyG) * 100 : null;

            return {
              id: r.variant_id,
              variantId: r.variant_id,
              supplierCode: supCode,
              supplier: supCode,
              supplierProductId: r.supplier_product_id,
              supplierProductName: r.supplier_product_name,
              originalProductName: r.supplier_product_name,
              variantName: r.variant_name,
              sku: r.sku || null,
              quantity: Number(r.quantity),
              unit: r.unit,
              normalizedQuantityG: pkgQtyG,
              normalizedQuantityMl: pkgQtyMl,
              listedPrice: priceAmount,
              currency: sourceCurrency,
              priceType: 'actual' as const,
              availability: (r.variant_availability === 'in_stock' ? 'in_stock' : r.variant_availability === 'out_of_stock' ? 'out_of_stock' : 'unknown') as any,
              sourceUrl: r.price_source_url || r.product_url || '',
              lastCheckedAt: r.price_observed_at || new Date().toISOString(),
              scrapedAt: r.price_observed_at,
              originalPriceText: r.original_price_text || `${sourceCurrency} ${priceAmount.toFixed(2)}`,
              convertedPrice: Math.round(convertedPrice * 100) / 100,
              displayCurrency,
              fxRate,
              pricePerHundredGrams: pricePerHundredGrams != null ? Math.round(pricePerHundredGrams * 100) / 100 : null,
              normalizedPrices: normalized,
              purchaseCalculation: purchase,
            };
          })
          .sort(
            (a, b) =>
              (a.normalizedQuantityG || a.normalizedQuantityMl || 0) -
              (b.normalizedQuantityG || b.normalizedQuantityMl || 0)
          );

        // Find best variant for target quantity
        let bestVariant = null;
        if (targetMass) {
          bestVariant =
            variants.find((v) => v.normalizedQuantityG && v.normalizedQuantityG >= targetMass) ||
            variants[variants.length - 1] ||
            null;
        } else if (targetVolume) {
          bestVariant =
            variants.find((v) => v.normalizedQuantityMl && v.normalizedQuantityMl >= targetVolume) ||
            variants[variants.length - 1] ||
            null;
        } else {
          bestVariant = variants[0] || null;
        }

        const bestPurchase = bestVariant?.purchaseCalculation || null;
        const convertedBestPrice = bestVariant ? bestVariant.convertedPrice : null;

        return {
          supplier: supCode,
          supplierName: firstRow.supplier_display_name || supCode,
          productName: firstRow.supplier_product_name || material.canonical_name,
          originalProductName: firstRow.supplier_product_name || material.canonical_name,
          sourceCurrency,
          displayCurrency,
          fxRate,
          matchConfidence: 0.95,
          matchType: 'strong' as const,
          matchEvidence: {
            casMatch: !!material.cas_number,
            nameMatchScore: 0.95,
            manufacturerMatch: !!firstRow.manufacturer,
            manuallyVerified: false,
            notes: null,
          },
          bestVariant,
          bestVariantForTarget: bestVariant,
          allVariants: variants,
          variants,
          purchase: bestPurchase,
          purchaseCalculation: bestPurchase,
          convertedBestPrice,
          status: variants.length > 0 ? ('success' as const) : ('not_found' as const),
          statusMessage: variants.length === 0 ? 'No priced variants found' : null,
        };
      })
    );

    // 7. Get price history
    const { data: historyData } = await supabase
      .from('price_history_view')
      .select('*')
      .eq('material_id', material.id)
      .order('observed_at', { ascending: true })
      .limit(200);

    const priceHistory = (historyData || []).map((row: any) => {
      const s = toSupplierCode(row.supplier);
      const qtyG = Number(row.quantity) || 1;
      const pricePerHundredGrams = (Number(row.price_amount) / qtyG) * 100;
      return {
        date: row.observed_at,
        supplier: s,
        pricePerHundredGrams,
        currency: row.currency || 'USD',
        convertedPrice: null,
      };
    });

    return res.json({
      // Frontend ComparisonResult contract
      materialId: material.id,
      materialName: material.canonical_name,
      casNumber: material.cas_number || null,
      category: material.category || null,
      suppliers,
      priceHistory,
      lastFetchedAt: new Date().toISOString(),

      // Backward compatibility fields
      status: 'success',
      query,
      material,
      aliases: aliases || [],
      targetQuantity,
      targetUnit,
      displayCurrency,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[Compare] Error:', err);
    return res.status(500).json({ error: 'Comparison failed' });
  }
});

export default router;
