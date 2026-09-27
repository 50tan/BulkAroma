import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend', '.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seed() {
  console.log('Seeding initial reference materials...');

  // 1. Iso E Super (the golden benchmark)
  const { data: isoMaterial, error: mError } = await supabase
    .from('materials')
    .upsert({
      canonical_name: 'Iso E Super',
      normalized_name: 'iso e super',
      cas_number: '54464-57-2',
      chemical_name: '1-(1,2,3,4,5,6,7,8-Octahydro-2,3,8,8-tetramethyl-2-naphthyl)ethan-1-one',
      category: 'Woody Amber',
      description: 'Widely used synthetic woody-amber aroma chemical, known for transparency and longevity.',
    }, { onConflict: 'normalized_name' })
    .select()
    .single();

  if (mError) {
    console.error('Error inserting material:', mError);
    return;
  }
  const matId = isoMaterial.id;
  console.log('✓ Inserted material: Iso E Super (ID:', matId, ')');

  // 2. Material Aliases
  await supabase.from('material_aliases').upsert([
    {
      material_id: matId,
      supplier: 'psh',
      source_name: 'Iso E Super (IFF)',
      normalized_name: 'iso e super iff',
      alias: 'Iso E Super (IFF)',
      confidence: 1.0,
      match_reason: 'cas_and_mfg_verified',
    },
    {
      material_id: matId,
      supplier: 'fraterworks',
      source_name: 'Iso E Super™',
      normalized_name: 'iso e super tm',
      alias: 'Iso E Super™',
      confidence: 0.99,
      match_reason: 'cas_verified',
    },
    {
      material_id: matId,
      supplier: 'pa',
      source_name: 'Iso E Super',
      normalized_name: 'iso e super',
      alias: 'Iso E Super',
      confidence: 1.0,
      match_reason: 'exact_name_match',
    },
  ]);
  console.log('✓ Inserted material aliases');

  // 3. Supplier Products
  // PSH Product
  const { data: pshProd } = await supabase.from('supplier_products').upsert({
    supplier: 'psh',
    original_name: 'Iso E Super (IFF)',
    normalized_name: 'iso e super iff',
    canonical_material_id: matId,
    manufacturer: 'IFF',
    brand: 'IFF',
    cas_number: '54464-57-2',
    sku: 'IFF-ISO-E',
    product_type: 'Aroma Chemical',
    source_url: 'https://perfumersupplyhouse.com/product/iso-e-super-iff/',
    availability: 'in_stock',
  }, { onConflict: 'supplier,source_url' }).select().single();

  // Fraterworks Product
  const { data: fwProd } = await supabase.from('supplier_products').upsert({
    supplier: 'fraterworks',
    original_name: 'Iso E Super™',
    normalized_name: 'iso e super tm',
    canonical_material_id: matId,
    manufacturer: 'Fraterworks',
    brand: 'Fraterworks',
    cas_number: '54464-57-2',
    sku: 'FW-ISO-E',
    product_type: 'Specialty Synthetics',
    source_url: 'https://fraterworks.com/products/iso-e-super',
    availability: 'in_stock',
  }, { onConflict: 'supplier,source_url' }).select().single();

  // PA Product
  const { data: paProd } = await supabase.from('supplier_products').upsert({
    supplier: 'pa',
    original_name: 'Iso E Super',
    normalized_name: 'iso e super',
    canonical_material_id: matId,
    manufacturer: 'IFF',
    brand: 'Perfumers Apprentice',
    cas_number: '54464-57-2',
    sku: 'PA-ISO-E',
    product_type: 'Aroma Chemical',
    source_url: 'https://shop.perfumersapprentice.com/p-6124-iso-e-super.aspx',
    availability: 'in_stock',
  }, { onConflict: 'supplier,source_url' }).select().single();

  console.log('✓ Inserted supplier products for all 3 suppliers');

  // 4. Product Variants
  // PSH variants: 5g, 25g, 60g, 200g, 1kg
  const pshVariants = [
    { name: '5 g', qty: 5, unit: 'g', g: 5, price: 6.00, currency: 'USD' },
    { name: '25 g', qty: 25, unit: 'g', g: 25, price: 10.50, currency: 'USD' },
    { name: '60 g', qty: 60, unit: 'g', g: 60, price: 18.00, currency: 'USD' },
    { name: '200 g', qty: 200, unit: 'g', g: 200, price: 30.00, currency: 'USD' },
    { name: '1 kg', qty: 1, unit: 'kg', g: 1000, price: 110.00, currency: 'USD' },
  ];

  for (const v of pshVariants) {
    const { data: pv } = await supabase.from('product_variants').upsert({
      supplier_product_id: pshProd.id,
      variant_name: v.name,
      quantity: v.qty,
      unit: v.unit,
      normalized_quantity_g: v.g,
      availability: 'in_stock',
    }, { onConflict: 'supplier_product_id,variant_name' }).select().single();

    if (pv) {
      await supabase.from('price_observations').insert({
        product_variant_id: pv.id,
        price_amount: v.price,
        currency: v.currency,
        original_price_text: `$${v.price.toFixed(2)} USD`,
        availability: 'in_stock',
        observed_at: new Date().toISOString(),
        source_url: pshProd.source_url,
      });
    }
  }

  // Fraterworks variants: 25g, 100g, 250g, 500g, 1kg (NZD currency)
  const fwVariants = [
    { name: '25 g', qty: 25, unit: 'g', g: 25, price: 12.00, currency: 'NZD' },
    { name: '100 g', qty: 100, unit: 'g', g: 100, price: 28.00, currency: 'NZD' },
    { name: '250 g', qty: 250, unit: 'g', g: 250, price: 45.00, currency: 'NZD' },
    { name: '500 g', qty: 500, unit: 'g', g: 500, price: 65.00, currency: 'NZD' },
    { name: '1 kg', qty: 1, unit: 'kg', g: 1000, price: 115.00, currency: 'NZD' },
  ];

  for (const v of fwVariants) {
    const { data: pv } = await supabase.from('product_variants').upsert({
      supplier_product_id: fwProd.id,
      variant_name: v.name,
      quantity: v.qty,
      unit: v.unit,
      normalized_quantity_g: v.g,
      availability: 'in_stock',
    }, { onConflict: 'supplier_product_id,variant_name' }).select().single();

    if (pv) {
      await supabase.from('price_observations').insert({
        product_variant_id: pv.id,
        price_amount: v.price,
        currency: v.currency,
        original_price_text: `NZ$ ${v.price.toFixed(2)}`,
        availability: 'in_stock',
        observed_at: new Date().toISOString(),
        source_url: fwProd.source_url,
      });
    }
  }

  // PA variants: 15ml, 50ml, 100ml, 250ml, 500ml, 1000ml (USD)
  const paVariants = [
    { name: '15 ml', qty: 15, unit: 'ml', ml: 15, g: 14.55, price: 6.50, currency: 'USD' }, // density ~0.97
    { name: '50 ml', qty: 50, unit: 'ml', ml: 50, g: 48.5, price: 12.00, currency: 'USD' },
    { name: '100 ml', qty: 100, unit: 'ml', ml: 100, g: 97.0, price: 18.00, currency: 'USD' },
    { name: '250 ml', qty: 250, unit: 'ml', ml: 250, g: 242.5, price: 34.00, currency: 'USD' },
    { name: '500 ml', qty: 500, unit: 'ml', ml: 500, g: 485.0, price: 58.00, currency: 'USD' },
    { name: '1000 ml', qty: 1000, unit: 'ml', ml: 1000, g: 970.0, price: 98.00, currency: 'USD' },
  ];

  for (const v of paVariants) {
    const { data: pv } = await supabase.from('product_variants').upsert({
      supplier_product_id: paProd.id,
      variant_name: v.name,
      quantity: v.qty,
      unit: v.unit,
      normalized_quantity_g: v.g,
      normalized_quantity_ml: v.ml,
      availability: 'in_stock',
    }, { onConflict: 'supplier_product_id,variant_name' }).select().single();

    if (pv) {
      await supabase.from('price_observations').insert({
        product_variant_id: pv.id,
        price_amount: v.price,
        currency: v.currency,
        original_price_text: `$${v.price.toFixed(2)} USD`,
        availability: 'in_stock',
        observed_at: new Date().toISOString(),
        source_url: paProd.source_url,
      });
    }
  }

  // 5. Initial Currency Rates
  const rates = [
    { base: 'USD', target: 'INR', rate: 86.85, provider: 'initial_seed' },
    { base: 'USD', target: 'NZD', rate: 1.74, provider: 'initial_seed' },
    { base: 'NZD', target: 'INR', rate: 49.91, provider: 'initial_seed' },
    { base: 'NZD', target: 'USD', rate: 0.575, provider: 'initial_seed' },
    { base: 'USD', target: 'EUR', rate: 0.92, provider: 'initial_seed' },
    { base: 'USD', target: 'GBP', rate: 0.77, provider: 'initial_seed' },
    { base: 'EUR', target: 'INR', rate: 94.40, provider: 'initial_seed' },
    { base: 'GBP', target: 'INR', rate: 112.80, provider: 'initial_seed' },
  ];

  for (const r of rates) {
    await supabase.from('currency_rates').upsert({
      base_currency: r.base,
      target_currency: r.target,
      rate: r.rate,
      provider: r.provider,
      observed_at: new Date().toISOString(),
    });
  }
  console.log('✓ Inserted exchange rates');

  // Also add 2 more materials: Linalool and Ambroxan
  const { data: linalool } = await supabase.from('materials').upsert({
    canonical_name: 'Linalool',
    normalized_name: 'linalool',
    cas_number: '78-70-6',
    chemical_name: '3,7-Dimethylocta-1,6-dien-3-ol',
    category: 'Floral Citrus',
    description: 'Naturally occurring terpene alcohol found in many flowers and spice plants.',
  }, { onConflict: 'normalized_name' }).select().single();

  if (linalool) {
    const { data: lPsh } = await supabase.from('supplier_products').upsert({
      supplier: 'psh',
      original_name: 'Linalool Synthetic (BASF)',
      normalized_name: 'linalool synthetic basf',
      canonical_material_id: linalool.id,
      manufacturer: 'BASF',
      cas_number: '78-70-6',
      source_url: 'https://perfumersupplyhouse.com/product/linalool-synthetic-basf/',
      availability: 'in_stock',
    }, { onConflict: 'supplier,source_url' }).select().single();

    if (lPsh) {
      const { data: lv } = await supabase.from('product_variants').upsert({
        supplier_product_id: lPsh.id,
        variant_name: '100 g',
        quantity: 100,
        unit: 'g',
        normalized_quantity_g: 100,
        availability: 'in_stock',
      }, { onConflict: 'supplier_product_id,variant_name' }).select().single();
      if (lv) {
        await supabase.from('price_observations').insert({
          product_variant_id: lv.id,
          price_amount: 14.00,
          currency: 'USD',
          original_price_text: '$14.00 USD',
          availability: 'in_stock',
          observed_at: new Date().toISOString(),
          source_url: lPsh.source_url,
        });
      }
    }
  }

  console.log('\n✓ Initial real dataset seeded successfully!');
}

seed().catch(console.error);
