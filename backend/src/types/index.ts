// ─── Shared domain types ───────────────────────────────────────────────────

export type Unit =
  | 'g' | 'kg' | 'mg'
  | 'ml' | 'l' | 'oz' | 'lb'
  | 'piece' | 'unit';

export type PhysicalState = 'solid' | 'liquid' | 'semi-solid' | 'powder' | 'unknown';

export type MatchType =
  | 'cas_match'
  | 'manufacturer_name_match'
  | 'chemical_identity_match'
  | 'alias_match'
  | 'normalized_name_match'
  | 'fuzzy_match'
  | 'user_override';

export type MatchDecision = 'confirmed' | 'rejected' | 'pending';

// ─── Material ────────────────────────────────────────────────────────────────

export interface Material {
  id: string;
  iupac_name: string | null;
  common_name: string;
  cas_number: string | null;
  ec_number: string | null;
  physical_state: PhysicalState;
  density_g_per_ml: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface MaterialAlias {
  id: string;
  material_id: string;
  alias: string;
  source: string | null;
  created_at: string;
}

// ─── Supplier ────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  country: string | null;
  currency: string;
  notes: string | null;
  created_at: string;
}

// ─── Supplier Product ────────────────────────────────────────────────────────

export interface SupplierProduct {
  id: string;
  supplier_id: string;
  raw_name: string;
  raw_description: string | null;
  cas_number: string | null;
  manufacturer: string | null;
  product_url: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Product Variant ─────────────────────────────────────────────────────────

export interface ProductVariant {
  id: string;
  supplier_product_id: string;
  quantity: number;
  unit: Unit;
  sku: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Price ───────────────────────────────────────────────────────────────────

export interface Price {
  id: string;
  variant_id: string;
  listed_price: number;
  currency: string;
  in_stock: boolean;
  scraped_at: string;
  scrape_run_id: string | null;
}

// ─── Match Mapping ────────────────────────────────────────────────────────────

export interface MatchMapping {
  id: string;
  supplier_product_id: string;
  material_id: string;
  match_type: MatchType;
  confidence: number;
  decision: MatchDecision;
  decided_by: string | null;
  decided_at: string | null;
  evidence: MatchEvidence[];
  created_at: string;
}

export interface MatchEvidence {
  field: string;
  supplierValue: string;
  materialValue: string;
  score: number;
}

export interface UserMatchOverride {
  sourceProductId: string;
  targetMaterialId: string;
  decision: MatchDecision;
  decidedBy: string;
}

// ─── Scrape Run ───────────────────────────────────────────────────────────────

export type ScrapeStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ScrapeRun {
  id: string;
  supplier_id: string;
  status: ScrapeStatus;
  started_at: string | null;
  completed_at: string | null;
  products_found: number | null;
  products_new: number | null;
  products_updated: number | null;
  error_message: string | null;
  triggered_by: string | null;
  created_at: string;
}

// ─── Currency ────────────────────────────────────────────────────────────────

export interface CurrencyRate {
  id: string;
  base_currency: string;
  target_currency: string;
  rate: number;
  observed_at: string;
  created_at?: string;
  provider: string;
}

// ─── Comparison ──────────────────────────────────────────────────────────────

export interface NormalizedPrices {
  per100g: number | null;
  perKg: number | null;
  per100ml: number | null;
  perL: number | null;
}

export interface PurchaseCalculation {
  packagesRequired: number;
  actualQuantityPurchased: number;
  actualQuantityUnit: Unit;
  excess: number;
  actualCost: number;
  currency: string;
}

export interface SupplierComparisonResult {
  supplierProduct: SupplierProduct;
  supplier: Supplier;
  variant: ProductVariant;
  latestPrice: Price;
  normalizedPrices: NormalizedPrices;
  purchaseCalculation: PurchaseCalculation;
  convertedPrice: number;
  displayCurrency: string;
  inStock: boolean;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export type ExportJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ExportJob {
  id: string;
  status: ExportJobStatus;
  filePath: string | null;
  downloadUrl: string | null;
  error: string | null;
  createdAt: string;
  completedAt: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
