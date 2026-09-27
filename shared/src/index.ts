// ============================================================
// Bulkaroma Price Intelligence — Shared Types
// ============================================================

// --- Suppliers ---

export type SupplierKey = 'psh' | 'fraterworks' | 'pa';

export const SUPPLIER_NAMES: Record<SupplierKey, string> = {
  psh: 'Perfumer Supply House',
  fraterworks: 'Fraterworks',
  pa: "The Perfumer's Apprentice",
};

export const SUPPLIER_URLS: Record<SupplierKey, string> = {
  psh: 'https://perfumersupplyhouse.com',
  fraterworks: 'https://fraterworks.com',
  pa: 'https://shop.perfumersapprentice.com',
};

export const SUPPLIER_CURRENCIES: Record<SupplierKey, string> = {
  psh: 'USD',
  fraterworks: 'NZD',
  pa: 'USD',
};

// --- Units ---

export type MassUnit = 'mg' | 'g' | 'kg' | 'oz' | 'lb';
export type VolumeUnit = 'ml' | 'L' | 'fl_oz';
export type Unit = MassUnit | VolumeUnit;
export type UnitType = 'mass' | 'volume';

export const MASS_UNITS: MassUnit[] = ['mg', 'g', 'kg', 'oz', 'lb'];
export const VOLUME_UNITS: VolumeUnit[] = ['ml', 'L', 'fl_oz'];

export function getUnitType(unit: Unit): UnitType {
  if (MASS_UNITS.includes(unit as MassUnit)) return 'mass';
  if (VOLUME_UNITS.includes(unit as VolumeUnit)) return 'volume';
  throw new Error(`Unknown unit: ${unit}`);
}

// Conversion to base units (g for mass, ml for volume)
export const TO_GRAMS: Record<MassUnit, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
};

export const TO_ML: Record<VolumeUnit, number> = {
  ml: 1,
  L: 1000,
  fl_oz: 29.5735,
};

export function normalizeToGrams(quantity: number, unit: MassUnit): number {
  return quantity * TO_GRAMS[unit];
}

export function normalizeToMl(quantity: number, unit: VolumeUnit): number {
  return quantity * TO_ML[unit];
}

// --- Currencies ---

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'NZD' | 'JPY' | 'SGD' | 'AED' | 'INR';

export const CURRENCIES: Record<CurrencyCode, { symbol: string; name: string }> = {
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  CAD: { symbol: 'C$', name: 'Canadian Dollar' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar' },
  JPY: { symbol: '¥', name: 'Japanese Yen' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham' },
  INR: { symbol: '₹', name: 'Indian Rupee' },
};

// --- Materials ---

export interface Material {
  id: string;
  canonical_name: string;
  normalized_name: string;
  cas_number: string | null;
  chemical_name: string | null;
  category: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialAlias {
  id: string;
  material_id: string;
  supplier: SupplierKey | null;
  source_name: string;
  normalized_name: string;
  confidence: number;
  match_reason: string | null;
  created_at: string;
  updated_at: string;
}

// --- Supplier Products ---

export interface SupplierProduct {
  id: string;
  supplier: SupplierKey;
  source_product_id: string | null;
  original_name: string;
  normalized_name: string;
  canonical_material_id: string | null;
  manufacturer: string | null;
  brand: string | null;
  cas_number: string | null;
  chemical_name: string | null;
  sku: string | null;
  product_type: string | null;
  description: string | null;
  source_url: string;
  image_url: string | null;
  availability: ProductAvailability;
  raw_metadata: Record<string, unknown> | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export type ProductAvailability = 'in_stock' | 'out_of_stock' | 'unknown' | 'discontinued' | 'not_seen_in_latest_crawl';

// --- Product Variants ---

export interface ProductVariant {
  id: string;
  supplier_product_id: string;
  variant_name: string;
  quantity: number;
  unit: Unit;
  normalized_quantity_g: number | null;
  normalized_quantity_ml: number | null;
  sku: string | null;
  availability: ProductAvailability;
  created_at: string;
  updated_at: string;
}

// --- Price Observations ---

export interface PriceObservation {
  id: string;
  product_variant_id: string;
  price_amount: number;
  currency: CurrencyCode;
  original_price_text: string;
  sale_price: number | null;
  original_list_price: number | null;
  availability: ProductAvailability;
  observed_at: string;
  source_url: string;
  scrape_run_id: string | null;
  created_at: string;
}

// --- Scrape Runs ---

export interface ScrapeRun {
  id: string;
  supplier: SupplierKey;
  started_at: string;
  completed_at: string | null;
  status: ScrapeRunStatus;
  products_found: number;
  products_updated: number;
  variants_found: number;
  prices_found: number;
  errors_count: number;
  blocked_count: number;
  parser_warnings: string[];
}

export type ScrapeRunStatus = 'running' | 'completed' | 'failed' | 'blocked' | 'partial';

// --- Match Mappings ---

export type MatchType = 'exact' | 'strong' | 'possible' | 'uncertain' | 'not_matched';

export interface MatchMapping {
  id: string;
  source_product_id: string;
  target_material_id: string;
  match_type: MatchType;
  confidence: number;
  reason: string;
  matching_evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// --- Currency Rates ---

export interface CurrencyRate {
  id: string;
  base_currency: CurrencyCode;
  target_currency: CurrencyCode;
  rate: number;
  provider: string;
  observed_at: string;
  created_at: string;
}

// --- Comparison Results ---

export interface ComparisonRequest {
  query: string;
  targetQuantity: number;
  targetUnit: Unit;
  displayCurrency: CurrencyCode;
}

export interface VariantComparison {
  variantId: string;
  supplierProductId: string;
  supplier: SupplierKey;
  supplierName: string;
  originalProductName: string;
  variantName: string;
  quantity: number;
  unit: Unit;
  normalizedQuantityG: number | null;
  normalizedQuantityMl: number | null;
  listedPrice: number;
  currency: CurrencyCode;
  originalPriceText: string;
  convertedPrice: number;
  displayCurrency: CurrencyCode;
  fxRate: number;
  availability: ProductAvailability;
  sourceUrl: string;
  scrapedAt: string;
}

export interface PurchaseCalculation {
  targetQuantity: number;
  targetUnit: Unit;
  packagesRequired: number;
  actualQuantityPurchased: number;
  excessQuantity: number;
  actualPurchaseCost: number;
  currency: CurrencyCode;
  convertedActualCost: number;
  displayCurrency: CurrencyCode;
}

export interface NormalizedPrice {
  per100g: number | null;
  perKg: number | null;
  per100ml: number | null;
  perLiter: number | null;
  displayCurrency: CurrencyCode;
  isCalculated: boolean;
}

export interface SupplierComparisonResult {
  supplier: SupplierKey;
  supplierName: string;
  originalProductName: string;
  matchType: MatchType;
  matchConfidence: number;
  matchEvidence: MatchEvidence[];
  variants: VariantComparison[];
  bestVariantForTarget: VariantComparison | null;
  purchaseCalculation: PurchaseCalculation | null;
  normalizedPrice: NormalizedPrice | null;
  status: SupplierStatus;
  statusMessage: string | null;
}

export type SupplierStatus = 'success' | 'partial' | 'not_found' | 'unavailable' | 'blocked' | 'timeout' | 'parse_error' | 'error';

export interface MatchEvidence {
  type: 'cas_match' | 'name_match' | 'manufacturer_match' | 'alias_match' | 'chemical_match' | 'fuzzy_match';
  description: string;
  confidence: number;
}

export interface MaterialComparisonResponse {
  material: Material;
  aliases: MaterialAlias[];
  suppliers: SupplierComparisonResult[];
  targetQuantity: number;
  targetUnit: Unit;
  displayCurrency: CurrencyCode;
  generatedAt: string;
}

// --- Export ---

export interface ExportJob {
  id: string;
  job_type: ExportJobType;
  status: ExportJobStatus;
  file_url: string | null;
  file_name: string | null;
  row_count: number | null;
  error_message: string | null;
  requested_by: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export type ExportJobType = 'common_materials' | 'all_variants' | 'price_history' | 'complete_workbook';
export type ExportJobStatus = 'pending' | 'running' | 'completed' | 'failed';

// --- Name normalization utility ---

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Quantity parsing utility ---

export interface ParsedQuantity {
  quantity: number;
  unit: Unit;
}

export function parseQuantityString(s: string): ParsedQuantity | null {
  const clean = s.trim().toLowerCase();
  const match = clean.match(/^([\d.]+)\s*(mg|g|kg|oz|lb|ml|l|fl\.?\s*oz?)$/);
  if (!match) return null;
  const quantity = parseFloat(match[1]);
  const rawUnit = match[2].replace(/\s+/g, '').replace('fl.oz', 'fl_oz').replace('floz', 'fl_oz');
  const unit = rawUnit === 'l' ? 'L' : rawUnit as Unit;
  if (isNaN(quantity) || quantity <= 0) return null;
  return { quantity, unit };
}

// --- Price formatting ---

export function formatPrice(amount: number, currency: CurrencyCode, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatWeight(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 2)} kg`;
  return `${grams} g`;
}
