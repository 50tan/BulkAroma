import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { CurrencyService } from './currency.service';

const EXPORTS_DIR = path.join(os.tmpdir(), 'bulkaroma-exports');

// Ensure exports directory exists
try {
  if (!fs.existsSync(EXPORTS_DIR)) {
    fs.mkdirSync(EXPORTS_DIR, { recursive: true });
  }
} catch {
  // Ignore in restricted environments
}

// Style helpers
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E6D61' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { color: { argb: 'FFFFFFFF' }, bold: true, size: 10 };
const ACTUAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1EDE7' } };
const CALCULATED_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
const UNAVAILABLE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE8E8' } };

function styleHeaders(sheet: ExcelJS.Worksheet, colCount: number) {
  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  headerRow.eachCell((cell, colNum) => {
    if (colNum <= colCount) {
      cell.fill = HEADER_FILL;
      cell.font = HEADER_FONT;
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FF0C2925' } },
      };
    }
  });
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colCount } };
}

function addCol(sheet: ExcelJS.Worksheet, header: string, width: number, numFmt?: string) {
  const col = sheet.columns.length;
  const letter = String.fromCharCode(65 + col);
  sheet.getColumn(letter).header = header;
  sheet.getColumn(letter).width = width;
  if (numFmt) sheet.getColumn(letter).numFmt = numFmt;
}

async function updateJobStatus(jobId: string, status: string, extra: Record<string, unknown> = {}) {
  await supabase.from('export_jobs').update({
    status,
    ...extra,
    ...(status === 'completed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
  }).eq('id', jobId);
}

async function fetchAllRows(table: string, select = '*', orderCol?: string, ascending = true): Promise<{ data: any[] }> {
  const rows: any[] = [];
  let from = 0;
  const chunkSize = 1000;
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + chunkSize - 1);
    if (orderCol) {
      query = query.order(orderCol, { ascending });
    }
    const { data, error } = await query;
    if (error) {
      console.error(`Error fetching ${table}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < chunkSize) break;
    from += chunkSize;
  }
  return { data: rows };
}

export class ExportService {
  /**
   * Generate the complete Bulkaroma_Common_Materials.xlsx workbook with all 8 sheets.
   */
  async generateCompleteWorkbook(jobId: string): Promise<string> {
    await updateJobStatus(jobId, 'running');

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Bulkaroma Price Intelligence';
    workbook.created = new Date();
    workbook.modified = new Date();

    try {
      const currencyService = new CurrencyService();

      // Fetch all data needed (with full pagination)
      const [
        commonMaterials,
        allProducts,
        allVariants,
        priceHistory,
        aliases,
        qualitySummary,
        usdToInr,
        nzdToInr,
      ] = await Promise.all([
        fetchAllRows('common_materials_view', '*', 'canonical_name'),
        fetchAllRows('supplier_products', '*', 'original_name'),
        fetchAllRows('current_supplier_prices', '*', 'canonical_name'),
        fetchAllRows('price_history_view', '*', 'observed_at', false),
        fetchAllRows('material_aliases', '*, materials(canonical_name)'),
        fetchAllRows('data_quality_summary', '*'),
        currencyService.getRate('USD', 'INR').catch(() => 83.5),
        currencyService.getRate('NZD', 'INR').catch(() => 51.5),
      ]);

      // --- Sheet 1: Common Materials ---
      const sheet1 = workbook.addWorksheet('Common Materials');
      sheet1.columns = [
        { header: 'Material ID', key: 'id', width: 38 },
        { header: 'Canonical Material Name', key: 'canonical_name', width: 35 },
        { header: 'CAS Number', key: 'cas_number', width: 15 },
        { header: 'Chemical Name', key: 'chemical_name', width: 30 },
        { header: 'Category', key: 'category', width: 20 },
        { header: 'PSH', key: 'available_at_psh', width: 8 },
        { header: 'Fraterworks', key: 'available_at_fraterworks', width: 14 },
        { header: "Perfumer's Apprentice", key: 'available_at_pa', width: 22 },
        { header: 'Supplier Count', key: 'supplier_count', width: 14 },
        { header: 'Total Variants', key: 'total_variants', width: 14 },
        { header: 'Last Price Update', key: 'last_price_update', width: 20 },
      ];
      styleHeaders(sheet1, 11);

      for (const mat of (commonMaterials.data || [])) {
        sheet1.addRow({
          ...mat,
          available_at_psh: mat.available_at_psh ? 'Yes' : 'No',
          available_at_fraterworks: mat.available_at_fraterworks ? 'Yes' : 'No',
          available_at_pa: mat.available_at_pa ? 'Yes' : 'No',
          last_price_update: mat.last_price_update ? new Date(mat.last_price_update) : 'N/A',
        });
      }
      sheet1.getColumn('last_price_update').numFmt = 'yyyy-mm-dd hh:mm';

      // --- Sheet 2: All Supplier Products ---
      const sheet2 = workbook.addWorksheet('All Supplier Products');
      sheet2.columns = [
        { header: 'Supplier Product ID', key: 'id', width: 38 },
        { header: 'Supplier', key: 'supplier', width: 12 },
        { header: 'Original Product Name', key: 'original_name', width: 40 },
        { header: 'Normalized Name', key: 'normalized_name', width: 35 },
        { header: 'Canonical Material', key: 'canonical_material_id', width: 38 },
        { header: 'CAS Number', key: 'cas_number', width: 15 },
        { header: 'Manufacturer', key: 'manufacturer', width: 25 },
        { header: 'Brand', key: 'brand', width: 20 },
        { header: 'SKU', key: 'sku', width: 18 },
        { header: 'Product Type', key: 'product_type', width: 15 },
        { header: 'Product URL', key: 'source_url', width: 50 },
        { header: 'Availability', key: 'availability', width: 15 },
        { header: 'First Seen', key: 'first_seen_at', width: 20 },
        { header: 'Last Seen', key: 'last_seen_at', width: 20 },
      ];
      styleHeaders(sheet2, 14);

      for (const prod of (allProducts.data || [])) {
        const row = sheet2.addRow({
          ...prod,
          first_seen_at: prod.first_seen_at ? new Date(prod.first_seen_at) : '',
          last_seen_at: prod.last_seen_at ? new Date(prod.last_seen_at) : '',
        });
        // Hyperlink the URL
        if (prod.source_url) {
          const cell = row.getCell('source_url');
          cell.value = { text: prod.source_url, hyperlink: prod.source_url };
          cell.font = { color: { argb: 'FF1E6D61' }, underline: true };
        }
      }
      sheet2.getColumn('first_seen_at').numFmt = 'yyyy-mm-dd';
      sheet2.getColumn('last_seen_at').numFmt = 'yyyy-mm-dd';

      // --- Sheet 3: All Variants & Prices (every variant = separate row) ---
      const sheet3 = workbook.addWorksheet('All Variants & Prices');
      sheet3.columns = [
        { header: 'Material', key: 'canonical_name', width: 35 },
        { header: 'Supplier', key: 'supplier', width: 12 },
        { header: 'Supplier Product Name', key: 'supplier_product_name', width: 40 },
        { header: 'Variant', key: 'variant_name', width: 20 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Unit', key: 'unit', width: 8 },
        { header: 'Listed Price (Original)', key: 'price_amount', width: 18 },
        { header: 'Original Currency', key: 'currency', width: 15 },
        { header: 'Converted Price (INR)', key: 'converted_price', width: 18 },
        { header: 'Price / 100g (Original)', key: 'per_100g', width: 18 },
        { header: 'Price / 100g (INR)', key: 'per_100g_inr', width: 18 },
        { header: 'FX Rate to INR', key: 'fx_rate', width: 14 },
        { header: 'Availability', key: 'variant_availability', width: 15 },
        { header: 'SKU', key: 'sku', width: 18 },
        { header: 'Source URL', key: 'price_source_url', width: 50 },
        { header: 'Scraped At', key: 'price_observed_at', width: 20 },
      ];
      styleHeaders(sheet3, 16);

      for (const v of (allVariants.data || [])) {
        const qtyG = v.normalized_quantity_g ? Number(v.normalized_quantity_g) : null;
        const per100g = qtyG && v.price_amount ? ((Number(v.price_amount) / qtyG) * 100) : null;
        const curr = (v.currency || 'USD').toUpperCase();
        const fxRate = curr === 'NZD' ? (nzdToInr as number) : (usdToInr as number);
        const convertedPrice = v.price_amount ? Number(v.price_amount) * fxRate : null;
        const per100gInr = per100g ? per100g * fxRate : null;

        const row = sheet3.addRow({
          canonical_name: v.canonical_name || 'N/A',
          supplier: v.supplier,
          supplier_product_name: v.supplier_product_name,
          variant_name: v.variant_name,
          quantity: Number(v.quantity),
          unit: v.unit,
          price_amount: v.price_amount ? Number(v.price_amount) : null,
          currency: curr,
          converted_price: convertedPrice ? Math.round(convertedPrice * 100) / 100 : null,
          per_100g: per100g ? Math.round(per100g * 100) / 100 : null,
          per_100g_inr: per100gInr ? Math.round(per100gInr * 100) / 100 : null,
          fx_rate: Math.round(fxRate * 10000) / 10000,
          variant_availability: v.variant_availability,
          sku: v.sku || '',
          price_source_url: v.price_source_url || v.product_url || '',
          price_observed_at: v.price_observed_at ? new Date(v.price_observed_at) : '',
        });

        if (v.price_amount) {
          row.getCell('price_amount').numFmt = '#,##0.00';
        }
        if (convertedPrice) {
          row.getCell('converted_price').numFmt = '#,##0.00';
        }
        if (per100g) {
          row.getCell('per_100g').numFmt = '#,##0.00';
        }
        if (per100gInr) {
          row.getCell('per_100g_inr').numFmt = '#,##0.00';
        }
        if (v.price_source_url || v.product_url) {
          const url = v.price_source_url || v.product_url;
          const cell = row.getCell('price_source_url');
          cell.value = { text: url, hyperlink: url };
          cell.font = { color: { argb: 'FF1E6D61' }, underline: true };
        }
      }
      sheet3.getColumn('price_observed_at').numFmt = 'yyyy-mm-dd hh:mm';

      // --- Sheet 4: Common Quantity Matrix ---
      const sheet4 = workbook.addWorksheet('Common Quantity Matrix');
      const TARGET_QTYS_G = [5, 10, 25, 50, 100, 250, 500, 1000];
      const SUPPLIER_KEYS = ['psh', 'fraterworks', 'pa'];
      const SUPPLIER_LABELS: Record<string, string> = { psh: 'PSH', fraterworks: 'Fraterworks', pa: "PA" };

      const s4Cols: Partial<ExcelJS.Column>[] = [
        { header: 'Material', key: 'material', width: 35 },
        { header: 'Target Qty', key: 'target_qty', width: 12 },
        { header: 'CAS', key: 'cas', width: 15 },
      ];
      for (const sk of SUPPLIER_KEYS) {
        s4Cols.push({ header: SUPPLIER_LABELS[sk], key: `price_${sk}`, width: 18 });
        s4Cols.push({ header: `${SUPPLIER_LABELS[sk]} Type`, key: `type_${sk}`, width: 14 });
      }
      sheet4.columns = s4Cols as ExcelJS.Column[];
      styleHeaders(sheet4, s4Cols.length);

      // Build lookup: materialId -> supplier -> variants
      const variantsByMaterialSupplier: Record<string, Record<string, typeof allVariants.data>> = {};
      for (const v of (allVariants.data || [])) {
        if (!v.canonical_name) continue;
        const matKey = v.material_id as string;
        if (!variantsByMaterialSupplier[matKey]) variantsByMaterialSupplier[matKey] = {};
        if (!variantsByMaterialSupplier[matKey][v.supplier]) variantsByMaterialSupplier[matKey][v.supplier] = [];
        variantsByMaterialSupplier[matKey][v.supplier]!.push(v);
      }

      for (const mat of (commonMaterials.data || [])) {
        const matVariants = variantsByMaterialSupplier[mat.id] || {};
        for (const targetG of TARGET_QTYS_G) {
          const rowData: Record<string, string | number> = {
            material: mat.canonical_name,
            target_qty: targetG < 1000 ? `${targetG} g` : `${targetG / 1000} kg`,
            cas: mat.cas_number || 'N/A',
          };

          for (const sk of SUPPLIER_KEYS) {
            const svariants = (matVariants[sk] || []).filter((v) => v.price_amount != null);
            if (svariants.length === 0) {
              rowData[`price_${sk}`] = 'Unavailable';
              rowData[`type_${sk}`] = 'Unavailable';
              continue;
            }

            // Check if exact package exists
            const exact = svariants.find((v) => v.normalized_quantity_g && Math.abs(Number(v.normalized_quantity_g) - targetG) < 0.01);
            if (exact) {
              rowData[`price_${sk}`] = Number(exact.price_amount);
              rowData[`type_${sk}`] = 'Actual';
            } else {
              // Calculate from nearest package
              const smallestLarger = svariants
                .filter((v) => v.normalized_quantity_g && Number(v.normalized_quantity_g) >= targetG)
                .sort((a, b) => Number(a.normalized_quantity_g) - Number(b.normalized_quantity_g))[0];
              const usedVariant = smallestLarger || svariants.sort((a, b) => Number(b.normalized_quantity_g || 0) - Number(a.normalized_quantity_g || 0))[0];
              if (usedVariant && usedVariant.normalized_quantity_g) {
                const calc = (Number(usedVariant.price_amount) / Number(usedVariant.normalized_quantity_g)) * targetG;
                rowData[`price_${sk}`] = Math.round(calc * 100) / 100;
                rowData[`type_${sk}`] = 'Calculated';
              } else {
                rowData[`price_${sk}`] = 'N/A';
                rowData[`type_${sk}`] = 'N/A';
              }
            }
          }

          const row = sheet4.addRow(rowData);
          // Color code by type
          for (const sk of SUPPLIER_KEYS) {
            const typeCell = row.getCell(`type_${sk}`);
            const priceCell = row.getCell(`price_${sk}`);
            if (rowData[`type_${sk}`] === 'Actual') {
              typeCell.fill = ACTUAL_FILL;
              priceCell.numFmt = '#,##0.00';
            } else if (rowData[`type_${sk}`] === 'Calculated') {
              typeCell.fill = CALCULATED_FILL;
              priceCell.numFmt = '#,##0.00';
            } else {
              typeCell.fill = UNAVAILABLE_FILL;
            }
          }
        }
      }

      // --- Sheet 5: Detailed Comparison ---
      const sheet5 = workbook.addWorksheet('Detailed Comparison');
      sheet5.columns = [
        { header: 'Canonical Material', key: 'material', width: 35 },
        { header: 'Target Quantity', key: 'target_qty', width: 14 },
        { header: 'Target Unit', key: 'target_unit', width: 12 },
        { header: 'Supplier', key: 'supplier', width: 14 },
        { header: 'Supplier Product Name', key: 'product_name', width: 40 },
        { header: 'Exact Package Available', key: 'exact_package', width: 20 },
        { header: 'Actual Package Quantity', key: 'pkg_qty', width: 22 },
        { header: 'Actual Package Unit', key: 'pkg_unit', width: 18 },
        { header: 'Listed Price (Original)', key: 'listed_price', width: 18 },
        { header: 'Original Currency', key: 'orig_currency', width: 16 },
        { header: 'Converted Price (INR)', key: 'converted_price_inr', width: 20 },
        { header: 'Equivalent Price (Original)', key: 'equiv_price', width: 22 },
        { header: 'Equivalent Price (INR)', key: 'equiv_price_inr', width: 22 },
        { header: 'Packages Required', key: 'pkgs_required', width: 18 },
        { header: 'Actual Qty Purchased', key: 'actual_qty', width: 22 },
        { header: 'Actual Purchase Cost (Original)', key: 'actual_cost', width: 24 },
        { header: 'Actual Purchase Cost (INR)', key: 'actual_cost_inr', width: 22 },
        { header: 'FX Rate to INR', key: 'fx_rate', width: 14 },
        { header: 'Excess Quantity', key: 'excess_qty', width: 16 },
        { header: 'Availability', key: 'availability', width: 14 },
        { header: 'Source URL', key: 'source_url', width: 50 },
        { header: 'Scraped At', key: 'scraped_at', width: 20 },
      ];
      styleHeaders(sheet5, 22);

      for (const mat of (commonMaterials.data || [])) {
        const matVariants = variantsByMaterialSupplier[mat.id] || {};
        for (const targetG of TARGET_QTYS_G) {
          for (const sk of SUPPLIER_KEYS) {
            const svariants = (matVariants[sk] || []).filter((v) => v.price_amount != null);
            if (svariants.length === 0) continue;

            const exact = svariants.find((v) => v.normalized_quantity_g && Math.abs(Number(v.normalized_quantity_g) - targetG) < 0.01);
            const best = exact || svariants.filter((v) => v.normalized_quantity_g && Number(v.normalized_quantity_g) >= targetG).sort((a, b) => Number(a.normalized_quantity_g) - Number(b.normalized_quantity_g))[0] || svariants.sort((a, b) => Number(b.normalized_quantity_g || 0) - Number(a.normalized_quantity_g || 0))[0];

            if (!best || !best.normalized_quantity_g) continue;

            const pkgQtyG = Number(best.normalized_quantity_g);
            const listedPrice = Number(best.price_amount);
            const pkgsRequired = Math.ceil(targetG / pkgQtyG);
            const actualQty = pkgsRequired * pkgQtyG;
            const excess = actualQty - targetG;
            const actualCost = pkgsRequired * listedPrice;
            const equivPrice = (listedPrice / pkgQtyG) * targetG;
            const curr = (best.currency || 'USD').toUpperCase();
            const fxRate = curr === 'NZD' ? (nzdToInr as number) : (usdToInr as number);
            const convertedPriceInr = listedPrice * fxRate;
            const equivPriceInr = equivPrice * fxRate;
            const actualCostInr = actualCost * fxRate;

            const row = sheet5.addRow({
              material: mat.canonical_name,
              target_qty: targetG,
              target_unit: 'g',
              supplier: sk.toUpperCase(),
              product_name: best.supplier_product_name,
              exact_package: exact ? 'Yes' : 'No',
              pkg_qty: Number(best.quantity),
              pkg_unit: best.unit,
              listed_price: listedPrice,
              orig_currency: curr,
              converted_price_inr: Math.round(convertedPriceInr * 100) / 100,
              equiv_price: Math.round(equivPrice * 100) / 100,
              equiv_price_inr: Math.round(equivPriceInr * 100) / 100,
              pkgs_required: pkgsRequired,
              actual_qty: actualQty,
              actual_cost: Math.round(actualCost * 100) / 100,
              actual_cost_inr: Math.round(actualCostInr * 100) / 100,
              fx_rate: Math.round(fxRate * 10000) / 10000,
              excess_qty: excess,
              availability: best.variant_availability,
              source_url: best.price_source_url || best.product_url || '',
              scraped_at: best.price_observed_at ? new Date(best.price_observed_at) : '',
            });

            row.getCell('listed_price').numFmt = '#,##0.00';
            row.getCell('converted_price_inr').numFmt = '#,##0.00';
            row.getCell('equiv_price').numFmt = '#,##0.00';
            row.getCell('equiv_price_inr').numFmt = '#,##0.00';
            row.getCell('actual_cost').numFmt = '#,##0.00';
            row.getCell('actual_cost_inr').numFmt = '#,##0.00';
            if (best.price_source_url || best.product_url) {
              const url = best.price_source_url || best.product_url;
              const cell = row.getCell('source_url');
              cell.value = { text: url, hyperlink: url };
              cell.font = { color: { argb: 'FF1E6D61' }, underline: true };
            }
          }
        }
      }
      sheet5.getColumn('scraped_at').numFmt = 'yyyy-mm-dd hh:mm';

      // --- Sheet 6: Price History ---
      const sheet6 = workbook.addWorksheet('Price History');
      sheet6.columns = [
        { header: 'Material', key: 'material_name', width: 35 },
        { header: 'Supplier', key: 'supplier', width: 14 },
        { header: 'Product', key: 'product_name', width: 40 },
        { header: 'Variant', key: 'variant_name', width: 20 },
        { header: 'Quantity', key: 'quantity', width: 10 },
        { header: 'Unit', key: 'unit', width: 8 },
        { header: 'Price', key: 'price_amount', width: 12 },
        { header: 'Currency', key: 'currency', width: 10 },
        { header: 'Observed At', key: 'observed_at', width: 20 },
        { header: 'Source URL', key: 'source_url', width: 50 },
      ];
      styleHeaders(sheet6, 10);

      let rowCount = 0;
      for (const h of (priceHistory.data || [])) {
        const row = sheet6.addRow({
          material_name: h.material_name || 'N/A',
          supplier: h.supplier,
          product_name: h.product_name,
          variant_name: h.variant_name,
          quantity: Number(h.quantity),
          unit: h.unit,
          price_amount: Number(h.price_amount),
          currency: h.currency,
          observed_at: h.observed_at ? new Date(h.observed_at) : '',
          source_url: h.source_url || '',
        });
        row.getCell('price_amount').numFmt = '#,##0.00';
        if (h.source_url) {
          const cell = row.getCell('source_url');
          cell.value = { text: h.source_url, hyperlink: h.source_url };
          cell.font = { color: { argb: 'FF1E6D61' }, underline: true };
        }
        rowCount++;
      }
      sheet6.getColumn('observed_at').numFmt = 'yyyy-mm-dd hh:mm';

      // --- Sheet 7: Name Mapping ---
      const sheet7 = workbook.addWorksheet('Name Mapping');
      sheet7.columns = [
        { header: 'Canonical Material', key: 'canonical_name', width: 35 },
        { header: 'Supplier', key: 'supplier', width: 14 },
        { header: 'Original Supplier Name', key: 'source_name', width: 40 },
        { header: 'Normalized Name', key: 'normalized_name', width: 35 },
        { header: 'CAS', key: 'cas_number', width: 15 },
        { header: 'Match Confidence', key: 'confidence', width: 18 },
        { header: 'Match Reason', key: 'match_reason', width: 30 },
      ];
      styleHeaders(sheet7, 7);

      for (const alias of (aliases.data || [])) {
        sheet7.addRow({
          canonical_name: (alias.materials as unknown as { canonical_name: string })?.canonical_name || 'N/A',
          supplier: alias.supplier || 'N/A',
          source_name: alias.source_name,
          normalized_name: alias.normalized_name,
          cas_number: 'N/A',
          confidence: alias.confidence ? `${(Number(alias.confidence) * 100).toFixed(0)}%` : 'N/A',
          match_reason: alias.match_reason || 'N/A',
        });
      }

      // --- Sheet 8: Data Quality ---
      const sheet8 = workbook.addWorksheet('Data Quality');
      sheet8.columns = [
        { header: 'Supplier', key: 'display_name', width: 28 },
        { header: 'Products Crawled', key: 'products_crawled', width: 18 },
        { header: 'Products Matched', key: 'products_matched', width: 18 },
        { header: 'Variants Found', key: 'variants_found', width: 16 },
        { header: 'Variants with Prices', key: 'variants_with_prices', width: 22 },
        { header: 'Missing CAS', key: 'missing_cas', width: 14 },
        { header: 'Missing Price', key: 'missing_price', width: 14 },
        { header: 'Last Crawl', key: 'last_crawl_started', width: 20 },
        { header: 'Recent Errors', key: 'recent_errors', width: 14 },
        { header: 'Recent Blocked', key: 'recent_blocked', width: 16 },
      ];
      styleHeaders(sheet8, 10);

      for (const q of (qualitySummary.data || [])) {
        sheet8.addRow({
          ...q,
          last_crawl_started: q.last_crawl_started ? new Date(q.last_crawl_started) : 'Never',
        });
      }
      sheet8.getColumn('last_crawl_started').numFmt = 'yyyy-mm-dd hh:mm';

      // Save to buffer
      const fileName = `Bulkaroma_Common_Materials_${Date.now()}.xlsx`;
      const buffer = await workbook.xlsx.writeBuffer();
      const nodeBuffer = Buffer.from(buffer);

      // Save to local tmp
      const filePath = path.join(EXPORTS_DIR, fileName);
      try {
        fs.writeFileSync(filePath, nodeBuffer);
      } catch (writeErr) {
        console.warn('[Export] Could not write local tmp file:', writeErr);
      }

      // Upload to Supabase Storage
      let fileUrl = `/api/export/download/${jobId}`;
      try {
        const bucketName = env.exportBucket || 'exports';
        const storagePath = `workbooks/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(bucketName)
          .upload(storagePath, nodeBuffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            upsert: true,
          });

        if (!uploadError) {
          const { data: signedData } = await supabase.storage
            .from(bucketName)
            .createSignedUrl(storagePath, 60 * 60 * 24); // 24 hour link
          if (signedData?.signedUrl) {
            fileUrl = signedData.signedUrl;
          }
        } else {
          console.warn('[Export] Supabase Storage upload info:', uploadError.message);
        }
      } catch (storageErr) {
        console.warn('[Export] Storage error, falling back to download route:', storageErr);
      }

      // Update job as completed
      await updateJobStatus(jobId, 'completed', {
        file_name: fileName,
        file_url: fileUrl,
        row_count: rowCount,
      });

      console.log(`[Export] Complete workbook generated: ${fileName}`);
      return filePath;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      await updateJobStatus(jobId, 'failed', { error_message: message });
      throw err;
    }
  }

  /**
   * Generate common materials workbook (same as complete but triggered from route).
   */
  async generateCommonMaterialsWorkbook(jobId: string): Promise<string> {
    return this.generateCompleteWorkbook(jobId);
  }
}
