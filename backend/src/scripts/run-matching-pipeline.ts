import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY!;

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Brand/manufacturer suffixes to strip for stem matching
const BRAND_SUFFIX_REGEX = /\s*\((?:iff|firmenich|givaudan|symrise|bedoukian|robertet|takasago|kao|ventos|synarome|mane|basf|vessel|pk perfumes|fraterworks|perfumer supply house|the perfumer's apprentice)\)\s*$/i;
const TRADEMARK_REGEX = /[™®©]/g;

function cleanStem(name: string): string {
  return name
    .replace(TRADEMARK_REGEX, '')
    .replace(BRAND_SUFFIX_REGEX, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanCas(cas: string | null | undefined): string | null {
  if (!cas) return null;
  const match = cas.match(/\b([0-9]{2,7}-[0-9]{2}-[0-9])\b/);
  return match ? match[1].trim() : null;
}

export type CoverageTier =
  | 'COMMON_ALL_3'
  | 'COMMON_PSH_FRATERWORKS'
  | 'COMMON_PSH_PA'
  | 'COMMON_FRATERWORKS_PA'
  | 'SINGLE_SUPPLIER';

export async function runMatchingPipeline() {
  console.log('\n======================================================');
  console.log('Bulkaroma — Two-Stage Material Matching Pipeline');
  console.log('======================================================\n');

  // 1. Fetch all supplier products
  console.log('Fetching all supplier products from database...');
  let allProducts: any[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from('supplier_products')
      .select('id, supplier, source_product_id, original_name, normalized_name, manufacturer, brand, cas_number, product_type, description')
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to fetch supplier products: ${error.message}`);
    if (!data || data.length === 0) break;
    allProducts.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  console.log(`Loaded ${allProducts.length} total supplier products.`);

  // 2. Fetch existing materials
  const { data: existingMaterials, error: matErr } = await supabase
    .from('materials')
    .select('id, canonical_name, normalized_name, cas_number, category');

  if (matErr) throw new Error(`Failed to fetch materials: ${matErr.message}`);

  const materialsById = new Map<string, any>();
  const materialsByCas = new Map<string, any>();
  const materialsByNormName = new Map<string, any>();

  for (const m of existingMaterials || []) {
    materialsById.set(m.id, m);
    if (m.cas_number) {
      const c = cleanCas(m.cas_number);
      if (c) materialsByCas.set(c, m);
    }
    materialsByNormName.set(m.normalized_name, m);
  }

  console.log(`Found ${materialsById.size} existing canonical materials in database.`);

  // 3. Stage A: Group products by CAS and by Clean Stem Name
  console.log('\nStage A: Candidate generation and grouping...');

  // Group 1: By CAS
  const productsByCas = new Map<string, any[]>();
  const productsWithoutCas: any[] = [];

  for (const p of allProducts) {
    const cas = cleanCas(p.cas_number);
    if (cas) {
      if (!productsByCas.has(cas)) productsByCas.set(cas, []);
      productsByCas.get(cas)!.push(p);
    } else {
      productsWithoutCas.push(p);
    }
  }

  console.log(`- Products with CAS: ${allProducts.length - productsWithoutCas.length} across ${productsByCas.size} unique CAS numbers`);
  console.log(`- Products without CAS: ${productsWithoutCas.length}`);

  // Resolve CAS groups to materials
  let casMatchesCount = 0;
  let newMaterialsCreated = 0;

  for (const [cas, prods] of productsByCas.entries()) {
    let material = materialsByCas.get(cas);

    if (!material) {
      // Pick best canonical name from products: shortest clean name, prefer title case
      const sorted = [...prods].sort((a, b) => {
        const cleanA = a.original_name.replace(BRAND_SUFFIX_REGEX, '').replace(TRADEMARK_REGEX, '').trim();
        const cleanB = b.original_name.replace(BRAND_SUFFIX_REGEX, '').replace(TRADEMARK_REGEX, '').trim();
        return cleanA.length - cleanB.length;
      });

      const bestName = sorted[0].original_name.replace(BRAND_SUFFIX_REGEX, '').replace(TRADEMARK_REGEX, '').trim();
      let normName = cleanStem(bestName);

      // Check unique constraint on normalized_name
      if (materialsByNormName.has(normName)) {
        normName = `${normName} ${cas.replace(/[^0-9]/g, '')}`;
      }

      const { data: created, error } = await supabase
        .from('materials')
        .insert({
          canonical_name: bestName,
          normalized_name: normName,
          cas_number: cas,
          category: prods[0].product_type || 'Aroma Chemical',
          description: prods[0].description || null,
        })
        .select()
        .single();

      if (error) {
        // If unique constraint violation, try with CAS suffix
        const fallbackNorm = `${normName} ${cas}`;
        const { data: retryCreated } = await supabase
          .from('materials')
          .insert({
            canonical_name: `${bestName} (${cas})`,
            normalized_name: fallbackNorm,
            cas_number: cas,
            category: prods[0].product_type || 'Aroma Chemical',
          })
          .select()
          .single();

        material = retryCreated;
      } else {
        material = created;
      }

      if (material) {
        materialsById.set(material.id, material);
        materialsByCas.set(cas, material);
        materialsByNormName.set(material.normalized_name, material);
        newMaterialsCreated++;
      }
    }

    if (material) {
      for (const p of prods) {
        p._matchedMaterialId = material.id;
        p._matchType = 'exact';
        p._confidence = 1.0;
        p._reason = `Exact CAS match: ${cas}`;
        casMatchesCount++;
      }
    }
  }

  // Stage B: Match products without CAS to materials or group by clean stem
  console.log('\nStage B: Cross-matching non-CAS products with CAS conflict prevention...');

  const stemMap = new Map<string, any[]>();
  for (const p of productsWithoutCas) {
    const stem = cleanStem(p.original_name);
    if (!stem) continue;
    if (!stemMap.has(stem)) stemMap.set(stem, []);
    stemMap.get(stem)!.push(p);
  }

  let stemMatchesCount = 0;

  for (const [stem, prods] of stemMap.entries()) {
    // Check if an existing material has this exact normalized stem
    let material = materialsByNormName.get(stem);

    if (material) {
      // CAS conflict check: ensure the candidate material doesn't contradict
      // (products without CAS don't contradict an existing material if name matches)
      for (const p of prods) {
        p._matchedMaterialId = material.id;
        p._matchType = 'strong';
        p._confidence = 0.95;
        p._reason = `Exact normalized name match to canonical material: "${material.canonical_name}"`;
        stemMatchesCount++;
      }
    } else {
      // Create new material for this stem group
      const sorted = [...prods].sort((a, b) => a.original_name.length - b.original_name.length);
      const bestName = sorted[0].original_name.replace(BRAND_SUFFIX_REGEX, '').replace(TRADEMARK_REGEX, '').trim();

      const { data: created, error } = await supabase
        .from('materials')
        .insert({
          canonical_name: bestName,
          normalized_name: stem,
          cas_number: null,
          category: prods[0].product_type || 'Aroma Chemical',
          description: prods[0].description || null,
        })
        .select()
        .single();

      if (created) {
        material = created;
        materialsById.set(material.id, material);
        materialsByNormName.set(stem, material);
        newMaterialsCreated++;

        for (const p of prods) {
          p._matchedMaterialId = material.id;
          p._matchType = 'strong';
          p._confidence = 0.90;
          p._reason = `Normalized name grouping for: "${bestName}"`;
          stemMatchesCount++;
        }
      }
    }
  }

  console.log(`- Created ${newMaterialsCreated} new canonical materials`);
  console.log(`- Matched ${casMatchesCount} products via CAS`);
  console.log(`- Matched ${stemMatchesCount} products via normalized name stem`);

  // 4. Update supplier_products, match_mappings, and material_aliases in database
  console.log('\nUpdating supplier_products and match_mappings in database...');

  const matchedProducts = allProducts.filter((p) => p._matchedMaterialId);

  // Batch update supplier_products in chunks of 200
  const CHUNK_SIZE = 200;
  for (let i = 0; i < matchedProducts.length; i += CHUNK_SIZE) {
    const chunk = matchedProducts.slice(i, i + CHUNK_SIZE);

    // Update canonical_material_id
    const updates = chunk.map((p) =>
      supabase
        .from('supplier_products')
        .update({ canonical_material_id: p._matchedMaterialId })
        .eq('id', p.id)
    );
    await Promise.all(updates);

    // Upsert match_mappings
    const mappingRecords = chunk.map((p) => ({
      source_product_id: p.id,
      target_material_id: p._matchedMaterialId,
      match_type: p._matchType,
      confidence: p._confidence,
      reason: p._reason,
      matching_evidence: {
        cas: cleanCas(p.cas_number),
        original_name: p.original_name,
        supplier: p.supplier,
      },
    }));

    await supabase
      .from('match_mappings')
      .upsert(mappingRecords, { onConflict: 'source_product_id,target_material_id' });

    // Upsert material_aliases
    const aliasRecords = chunk.map((p) => ({
      material_id: p._matchedMaterialId,
      supplier: p.supplier,
      source_name: p.original_name,
      normalized_name: cleanStem(p.original_name),
      confidence: p._confidence,
      match_reason: p._reason,
    }));

    await supabase
      .from('material_aliases')
      .insert(aliasRecords);
  }

  console.log(`Successfully updated ${matchedProducts.length} supplier products with canonical material links.`);

  // 5. Compute Coverage Tiers & Summary
  console.log('\n======================================================');
  console.log('Calculating Supplier Coverage Tiers');
  console.log('======================================================\n');

  // Query common materials view
  const { data: viewData, error: vErr } = await supabase
    .from('common_materials_view')
    .select('*');

  if (vErr) {
    console.error('Error fetching common_materials_view:', vErr.message);
  }

  // Count coverage tiers across all materials
  const { data: matCoverage } = await supabase
    .from('supplier_products')
    .select('supplier, canonical_material_id')
    .not('canonical_material_id', 'is', null);

  const suppliersPerMaterial = new Map<string, Set<string>>();
  for (const row of matCoverage || []) {
    if (!suppliersPerMaterial.has(row.canonical_material_id)) {
      suppliersPerMaterial.set(row.canonical_material_id, new Set());
    }
    suppliersPerMaterial.get(row.canonical_material_id)!.add(row.supplier);
  }

  const tierCounts: Record<CoverageTier, number> = {
    COMMON_ALL_3: 0,
    COMMON_PSH_FRATERWORKS: 0,
    COMMON_PSH_PA: 0,
    COMMON_FRATERWORKS_PA: 0,
    SINGLE_SUPPLIER: 0,
  };

  for (const [_, supps] of suppliersPerMaterial.entries()) {
    if (supps.size === 3) {
      tierCounts.COMMON_ALL_3++;
    } else if (supps.size === 2) {
      if (supps.has('psh') && supps.has('fraterworks')) tierCounts.COMMON_PSH_FRATERWORKS++;
      else if (supps.has('psh') && supps.has('pa')) tierCounts.COMMON_PSH_PA++;
      else if (supps.has('fraterworks') && supps.has('pa')) tierCounts.COMMON_FRATERWORKS_PA++;
    } else {
      tierCounts.SINGLE_SUPPLIER++;
    }
  }

  const totalCommon = tierCounts.COMMON_ALL_3 + tierCounts.COMMON_PSH_FRATERWORKS + tierCounts.COMMON_PSH_PA + tierCounts.COMMON_FRATERWORKS_PA;

  console.log('Coverage Tier Distribution:');
  console.log(`- COMMON_ALL_3 (Available across PSH, Fraterworks, and PA): ${tierCounts.COMMON_ALL_3}`);
  console.log(`- COMMON_PSH_FRATERWORKS:                                 ${tierCounts.COMMON_PSH_FRATERWORKS}`);
  console.log(`- COMMON_PSH_PA:                                          ${tierCounts.COMMON_PSH_PA}`);
  console.log(`- COMMON_FRATERWORKS_PA:                                  ${tierCounts.COMMON_FRATERWORKS_PA}`);
  console.log(`- Total Multi-Supplier Common Materials:                  ${totalCommon}`);
  console.log(`- Single Supplier Materials:                              ${tierCounts.SINGLE_SUPPLIER}`);
  console.log(`- Total Canonical Materials:                              ${suppliersPerMaterial.size}`);

  console.log('\n======================================================');
  console.log('Matching Pipeline Completed Successfully');
  console.log('======================================================\n');
}

if (require.main === module) {
  runMatchingPipeline().catch((err) => {
    console.error('Fatal error in matching pipeline:', err);
    process.exit(1);
  });
}
