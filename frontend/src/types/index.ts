// ─── Suppliers ───────────────────────────────────────────────────────────────

export type SupplierCode = 'PSH' | 'Fraterworks' | 'PA';

export interface Supplier {
  code: SupplierCode;
  name: string;
  country: string;
  currency: string;
  baseUrl: string;
  lastCrawledAt: string | null;
  productCount: number;
}

// ─── Units ────────────────────────────────────────────────────────────────────

export type WeightUnit = 'g' | 'kg' | 'oz' | 'lb';
export type VolumeUnit = 'ml' | 'L' | 'fl_oz';
export type QuantityUnit = WeightUnit | VolumeUnit;

export const UNIT_TO_GRAMS: Record<QuantityUnit, number> = {
  g: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  ml: 1,      // approximate: density ≈ 1 for many aroma chemicals
  L: 1000,
  fl_oz: 29.5735,
};

// ─── Currencies ───────────────────────────────────────────────────────────────

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CAD' | 'NZD' | 'JPY' | 'SGD' | 'AED' | 'INR';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  AUD: 'A$',
  CAD: 'C$',
  NZD: 'NZ$',
  JPY: '¥',
  SGD: 'S$',
  AED: 'د.إ',
  INR: '₹',
};

export const ALL_CURRENCIES: CurrencyCode[] = [
  'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'JPY', 'SGD', 'AED', 'INR',
];

// ─── Materials ────────────────────────────────────────────────────────────────

export interface Material {
  id: string;
  name: string;
  casNumber: string | null;
  chemicalName: string | null;
  category: string | null;
  description: string | null;
  suppliersAvailable: SupplierCode[];
  variantCount: number;
  updatedAt: string;
}

export interface CommonMaterial {
  id: string;
  name: string;
  casNumber: string | null;
  category: string | null;
  supplierNames: Record<SupplierCode, string | null>;
  supplierCount?: number;
  coverageTier?: string;
  matchConfidence: number;
  variantCount: number;
  updatedAt: string;
}

// ─── Variants / Products ──────────────────────────────────────────────────────

export interface Variant {
  id: string;
  supplierCode: SupplierCode;
  supplierProductName: string;
  sku: string | null;
  quantity: number;
  unit: QuantityUnit;
  listedPrice: number;
  currency: string;
  convertedPrice?: number | null;
  displayCurrency?: CurrencyCode | string;
  fxRate?: number;
  priceType: 'actual' | 'calculated';
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
  sourceUrl: string;
  lastCheckedAt: string;
  // Derived / normalized
  pricePerHundredGrams: number | null;
  normalizedPrices?: {
    per100g: number | null;
    perKg: number | null;
    per100ml: number | null;
    perLiter: number | null;
    currency?: string;
    originalPer100g?: number | null;
    originalPerKg?: number | null;
    originalCurrency?: string;
  };
}

// ─── Comparison ───────────────────────────────────────────────────────────────

export interface ComparisonRequest {
  query: string;
  quantity: number;
  unit: QuantityUnit;
  displayCurrency: CurrencyCode;
}

export interface SupplierComparison {
  supplier: SupplierCode;
  productName: string;
  originalProductName?: string;
  sourceCurrency?: string;
  displayCurrency?: CurrencyCode;
  fxRate?: number;
  matchConfidence: number;
  matchEvidence: MatchEvidence;
  bestVariant: Variant | null;
  bestVariantForTarget?: Variant | null;
  allVariants: Variant[];
  variants?: Variant[];
  purchase: PurchaseCalcResult | null;
  purchaseCalculation?: PurchaseCalcResult | null;
  convertedBestPrice: number | null;
  status?: string;
  statusMessage?: string | null;
}

export interface ComparisonResult {
  materialId: string;
  materialName: string;
  casNumber: string | null;
  category: string | null;
  suppliers: SupplierComparison[];
  priceHistory: PriceHistoryPoint[];
  lastFetchedAt: string;
}

// ─── Match Evidence ───────────────────────────────────────────────────────────

export interface MatchEvidence {
  casMatch: boolean | null;
  nameMatchScore: number | null;   // 0–1
  manufacturerMatch: boolean | null;
  manuallyVerified: boolean;
  notes: string | null;
}

// ─── Purchase Calculator ──────────────────────────────────────────────────────

export interface PurchaseCalcResult {
  packagesRequired: number;
  actualQuantityPurchased: number;
  actualUnit: QuantityUnit | string;
  excessQuantity: number;
  actualCost: number;
  actualCostCurrency: string;
  convertedActualCost: number | null;
  convertedCurrency: CurrencyCode | string | null;
}

// ─── Price History ────────────────────────────────────────────────────────────

export interface PriceHistoryPoint {
  date: string;
  supplier: SupplierCode;
  pricePerHundredGrams: number;
  currency: string;
  convertedPrice: number | null;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface PlatformStats {
  totalMaterials: number;
  totalSupplierProducts: number;
  totalVariants: number;
  commonMaterials: number;
  lastUpdatedAt: string;
}

// ─── Admin / Data Health ──────────────────────────────────────────────────────

export interface DataHealthRow {
  supplier: SupplierCode;
  productCount: number;
  variantCount: number;
  lastCrawlAt: string | null;
  lastCrawlStatus: 'success' | 'partial' | 'failed' | 'never';
  staleCount: number;
  errorCount: number;
}

export interface CrawlJob {
  id: string;
  supplier: SupplierCode | 'all';
  status: 'queued' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  completedAt: string | null;
  productsFound: number;
  productsProcessed: number;
  estimatedTotal: number | null;
  errors: string[];
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  name: string;
  casNumber: string | null;
  category: string | null;
  supplierCount: number;
  score: number;
}

// ─── Export ───────────────────────────────────────────────────────────────────

export type ExportType =
  | 'common_materials'
  | 'comparison'
  | 'variants'
  | 'price_history'
  | 'complete_workbook';

export interface ExportJob {
  id: string;
  type: ExportType;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  downloadUrl: string | null;
  createdAt: string;
  expiresAt: string | null;
}

// ─── Filters & Coverage ────────────────────────────────────────────────────────

export type CoverageFilter =
  | 'all'
  | 'all_3'
  | 'any_2'
  | 'psh_fraterworks'
  | 'psh_pa'
  | 'fraterworks_pa'
  | 'psh_only'
  | 'fraterworks_only'
  | 'pa_only';

export interface CoverageStats {
  total: number;
  all3: number;
  any2: number;
  exactly2: number;
  pshFraterworks: number;
  pshPa: number;
  fraterworksPa: number;
  pshOnly: number;
  fraterworksOnly: number;
  paOnly: number;
}

export interface MaterialFilters {
  category?: string;
  hasCas?: boolean;
  suppliers?: SupplierCode[];
  search?: string;
  coverage?: CoverageFilter;
}

export type MaterialSortField = 'name' | 'category' | 'supplierCount' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
