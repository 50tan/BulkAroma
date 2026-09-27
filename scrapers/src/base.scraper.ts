import axios, { AxiosRequestConfig } from 'axios';
import * as cheerio from 'cheerio';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import pLimit from 'p-limit';
import { config } from './config';

export type SupplierKey = 'psh' | 'fraterworks' | 'pa';
export type CurrencyCode = 'USD' | 'NZD' | 'EUR' | 'GBP' | 'AUD' | 'INR';
export type ProductAvailability = 'in_stock' | 'out_of_stock' | 'unknown' | 'discontinued';

export interface ParsedVariant {
  variantName: string;
  quantity: number;
  unit: string;
  normalizedQuantityG: number | null;
  normalizedQuantityMl: number | null;
  sku: string | null;
  price: number | null;
  currency: CurrencyCode;
  originalPriceText: string;
  availability: ProductAvailability;
}

export interface ParsedProduct {
  supplier: SupplierKey;
  sourceProductId: string | null;
  originalName: string;
  normalizedName: string;
  manufacturer: string | null;
  brand: string | null;
  casNumber: string | null;
  chemicalName: string | null;
  sku: string | null;
  productType: string | null;
  description: string | null;
  sourceUrl: string;
  imageUrl: string | null;
  availability: ProductAvailability;
  rawMetadata: Record<string, unknown>;
  variants: ParsedVariant[];
}

export interface ScrapeOptions {
  maxPages?: number;
  testMode?: boolean;
  startPage?: number;
}

export interface ScrapeRunSummary {
  productsFound: number;
  productsUpdated: number;
  variantsFound: number;
  pricesFound: number;
  errorsCount: number;
  blockedCount: number;
  parserWarnings: string[];
}

const MASS_TO_G: Record<string, number> = {
  mg: 0.001, g: 1, kg: 1000, oz: 28.3495, lb: 453.592,
};
const VOL_TO_ML: Record<string, number> = {
  ml: 1, l: 1000, 'fl oz': 29.5735, 'fl_oz': 29.5735,
};

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
];

export abstract class BaseScraper {
  protected readonly supplierKey: SupplierKey;
  protected readonly baseUrl: string;
  protected readonly currency: CurrencyCode;
  protected readonly supabase: SupabaseClient;
  protected scrapeRunId: string | null = null;
  protected parserWarnings: string[] = [];
  protected summary: ScrapeRunSummary = {
    productsFound: 0, productsUpdated: 0, variantsFound: 0,
    pricesFound: 0, errorsCount: 0, blockedCount: 0, parserWarnings: [],
  };

  private lastRequestTime = 0;
  private limit: ReturnType<typeof pLimit>;

  constructor(supplierKey: SupplierKey, baseUrl: string, currency: CurrencyCode) {
    this.supplierKey = supplierKey;
    this.baseUrl = baseUrl;
    this.currency = currency;
    this.supabase = createClient(config.supabaseUrl, config.supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    this.limit = pLimit(Number(config.concurrency) || 3);
  }

  /**
   * Check if a URL is allowed by robots.txt.
   */
  protected async checkRobotsTxt(userAgent: string, path: string): Promise<boolean> {
    try {
      const { data: html } = await axios.get(`${this.baseUrl}/robots.txt`, { timeout: 10000 });
      // Simple robots.txt check - look for Disallow: for our path
      const lines = html.split('\n');
      let inOurAgent = false;
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.toLowerCase().startsWith('user-agent:')) {
          const agent = trimmed.slice(11).trim();
          inOurAgent = agent === '*' || agent.toLowerCase() === userAgent.toLowerCase();
        }
        if (inOurAgent && trimmed.toLowerCase().startsWith('disallow:')) {
          const disallowed = trimmed.slice(9).trim();
          if (disallowed && path.startsWith(disallowed)) {
            return false; // Not allowed
          }
        }
      }
      return true; // Allowed
    } catch {
      return true; // If we can't fetch robots.txt, proceed
    }
  }

  /**
   * Throttled HTTP GET with retries and exponential backoff.
   */
  protected async get(url: string, options: AxiosRequestConfig = {}): Promise<string> {
    return this.limit(async () => {
      // Enforce delay between requests
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < config.requestDelayMs) {
        await this.sleep(config.requestDelayMs - elapsed);
      }
      this.lastRequestTime = Date.now();

      const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const response = await axios.get(url, {
            timeout: 30000,
            headers: {
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate',
              'Connection': 'keep-alive',
              ...options.headers,
            },
            ...options,
          });
          return response.data as string;
        } catch (err: unknown) {
          const error = err as { response?: { status?: number }; message?: string };
          const status = error.response?.status;

          if (status === 429 || status === 503) {
            this.summary.blockedCount++;
            const backoff = Math.min(30000, 2000 * Math.pow(2, attempt - 1));
            console.log(`  [${this.supplierKey.toUpperCase()}] Rate limited on ${url}, waiting ${backoff}ms...`);
            await this.sleep(backoff);
            continue;
          }

          if (status === 404) {
            throw new Error(`HTTP 404: ${url}`);
          }

          if (attempt === 3) {
            throw new Error(`Failed after 3 attempts: ${url} — ${error.message}`);
          }

          await this.sleep(2000 * attempt);
        }
      }
      throw new Error(`Max retries exceeded: ${url}`);
    });
  }

  protected async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Start a scrape run in Supabase and return the run ID.
   */
  protected async startScrapeRun(): Promise<string> {
    const { data, error } = await this.supabase
      .from('scrape_runs')
      .insert({
        supplier: this.supplierKey,
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.error(`[${this.supplierKey}] Failed to start scrape run:`, error);
      return 'unknown';
    }
    this.scrapeRunId = data.id;
    return data.id;
  }

  public setScrapeRunId(id: string) {
    this.scrapeRunId = id;
  }

  /**
   * Update running checkpoint in Supabase to enable reliable resume on interruption.
   */
  public async updateCheckpoint(checkpointData: Record<string, unknown>): Promise<void> {
    if (!this.scrapeRunId) return;
    try {
      const checkpointEntry = {
        type: 'checkpoint',
        ...checkpointData,
        updatedAt: new Date().toISOString(),
      };
      await this.supabase.from('scrape_runs').update({
        products_found: this.summary.productsFound,
        products_updated: this.summary.productsUpdated,
        variants_found: this.summary.variantsFound,
        prices_found: this.summary.pricesFound,
        errors_count: this.summary.errorsCount,
        parser_warnings: [...this.parserWarnings, checkpointEntry],
      }).eq('id', this.scrapeRunId);
    } catch (err: any) {
      console.warn(`  [${this.supplierKey.toUpperCase()}] Checkpoint update failed:`, err?.message);
    }
  }

  /**
   * Look up the last saved checkpoint for this supplier from Supabase.
   */
  public async getLastCheckpoint(): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await this.supabase
        .from('scrape_runs')
        .select('parser_warnings, status')
        .eq('supplier', this.supplierKey)
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (!data || !Array.isArray(data.parser_warnings)) return null;

      for (let i = data.parser_warnings.length - 1; i >= 0; i--) {
        const item = data.parser_warnings[i];
        if (item && typeof item === 'object' && item.type === 'checkpoint') {
          return item;
        }
        if (typeof item === 'string') {
          try {
            const parsed = JSON.parse(item);
            if (parsed.type === 'checkpoint') return parsed;
          } catch {}
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Complete the scrape run in Supabase.
   */
  protected async completeScrapeRun(status: 'completed' | 'failed' | 'partial' | 'blocked'): Promise<void> {
    if (!this.scrapeRunId) return;
    this.summary.parserWarnings = this.parserWarnings;

    await this.supabase.from('scrape_runs').update({
      completed_at: new Date().toISOString(),
      status,
      products_found: this.summary.productsFound,
      products_updated: this.summary.productsUpdated,
      variants_found: this.summary.variantsFound,
      prices_found: this.summary.pricesFound,
      errors_count: this.summary.errorsCount,
      blocked_count: this.summary.blockedCount,
      parser_warnings: this.parserWarnings,
    }).eq('id', this.scrapeRunId);
  }

  /**
   * Log a crawl error to Supabase.
   */
  protected async logError(url: string, errorType: string, message: string, httpStatus?: number): Promise<void> {
    this.summary.errorsCount++;
    console.error(`  [${this.supplierKey.toUpperCase()}] Error [${errorType}] ${url}: ${message}`);

    await this.supabase.from('crawl_errors').insert({
      scrape_run_id: this.scrapeRunId,
      supplier: this.supplierKey,
      url,
      error_type: errorType,
      error_message: message,
      http_status: httpStatus || null,
    });
  }

  /**
   * Upsert a supplier product to Supabase.
   */
  protected async upsertProduct(product: ParsedProduct): Promise<string | null> {
    const { data, error } = await this.supabase
      .from('supplier_products')
      .upsert({
        supplier: product.supplier,
        source_product_id: product.sourceProductId,
        original_name: product.originalName,
        normalized_name: product.normalizedName,
        manufacturer: product.manufacturer,
        brand: product.brand,
        cas_number: product.casNumber,
        chemical_name: product.chemicalName,
        sku: product.sku,
        product_type: product.productType,
        description: product.description,
        source_url: product.sourceUrl,
        image_url: product.imageUrl,
        availability: product.availability,
        raw_metadata: product.rawMetadata,
        last_seen_at: new Date().toISOString(),
      }, {
        onConflict: 'supplier,source_url',
        ignoreDuplicates: false,
      })
      .select('id')
      .single();

    if (error) {
      await this.logError(product.sourceUrl, 'upsert_error', error.message);
      return null;
    }

    this.summary.productsUpdated++;
    return data?.id || null;
  }

  /**
   * Upsert variants and create price observations.
   */
  protected async upsertVariants(productId: string, variants: ParsedVariant[]): Promise<void> {
    if (!variants || variants.length === 0) return;

    // Deduplicate variants by variantName within this product
    const uniqueVariantsMap = new Map<string, ParsedVariant>();
    for (const v of variants) {
      if (!uniqueVariantsMap.has(v.variantName)) {
        uniqueVariantsMap.set(v.variantName, v);
      }
    }
    const uniqueVariants = Array.from(uniqueVariantsMap.values());

    const records = uniqueVariants.map((v) => ({
      supplier_product_id: productId,
      variant_name: v.variantName,
      quantity: v.quantity,
      unit: v.unit,
      normalized_quantity_g: v.normalizedQuantityG,
      normalized_quantity_ml: v.normalizedQuantityMl,
      sku: v.sku,
      availability: v.availability,
    }));

    const { data: insertedVariants, error: variantError } = await this.supabase
      .from('product_variants')
      .upsert(records, {
        onConflict: 'supplier_product_id,variant_name',
        ignoreDuplicates: false,
      })
      .select('id, variant_name');

    if (variantError || !insertedVariants) {
      await this.logError('', 'variant_upsert_error', variantError?.message || 'No variant data returned');
      return;
    }

    this.summary.variantsFound += insertedVariants.length;

    const variantIdByName = new Map<string, string>();
    for (const iv of insertedVariants) {
      variantIdByName.set(iv.variant_name, iv.id);
    }

    const priceRecords = [];
    const nowIso = new Date().toISOString();

    for (const v of uniqueVariants) {
      const vId = variantIdByName.get(v.variantName);
      if (vId && v.price !== null) {
        priceRecords.push({
          product_variant_id: vId,
          price_amount: v.price,
          currency: v.currency,
          original_price_text: v.originalPriceText,
          availability: v.availability,
          observed_at: nowIso,
          source_url: '',
          scrape_run_id: this.scrapeRunId,
        });
      }
    }

    if (priceRecords.length > 0) {
      const { error: priceError } = await this.supabase
        .from('price_observations')
        .insert(priceRecords);

      if (!priceError) {
        this.summary.pricesFound += priceRecords.length;
      } else {
        await this.logError('', 'price_insert_error', priceError.message);
      }
    }
  }

  /**
   * Normalize a quantity to grams (for mass) or ml (for volume).
   */
  protected normalizeQuantity(quantity: number, unit: string): { grams: number | null; ml: number | null } {
    const unitLower = unit.toLowerCase().trim();
    if (unitLower in MASS_TO_G) {
      return { grams: quantity * MASS_TO_G[unitLower]!, ml: null };
    }
    if (unitLower in VOL_TO_ML) {
      return { grams: null, ml: quantity * VOL_TO_ML[unitLower]! };
    }
    // Try common aliases
    if (unitLower === 'liter' || unitLower === 'litre') return { grams: null, ml: quantity * 1000 };
    if (unitLower === 'gram' || unitLower === 'grams') return { grams: quantity, ml: null };
    if (unitLower === 'kilogram' || unitLower === 'kilograms') return { grams: quantity * 1000, ml: null };
    return { grams: null, ml: null };
  }

  /**
   * Parse price text to a number. Handles $30.00, NZ$45, £12.50, etc.
   */
  protected parsePrice(priceText: string): number | null {
    if (!priceText) return null;
    // Remove currency symbols and thousands separators, keep decimal point
    const cleaned = priceText.replace(/[^0-9.]/g, '');
    const price = parseFloat(cleaned);
    return isNaN(price) || price <= 0 ? null : price;
  }

  /**
   * Extract CAS number from text.
   */
  protected extractCas(text: string): string | null {
    if (!text) return null;
    const match = text.match(/\b(\d{2,7}-\d{2}-\d)\b/);
    return match ? match[1] || null : null;
  }

  /**
   * Try to extract JSON-LD product data from HTML.
   */
  protected extractJsonLd(html: string): Record<string, unknown> | null {
    const $ = cheerio.load(html);
    let result: Record<string, unknown> | null = null;

    $('script[type="application/ld+json"]').each((_, el) => {
      if (result) return;
      try {
        const json = JSON.parse($(el).html() || '{}');
        if (json['@type'] === 'Product' || (Array.isArray(json['@graph']) &&
          json['@graph'].some((g: { '@type': string }) => g['@type'] === 'Product'))) {
          result = json;
        }
      } catch {
        // ignore parse errors
      }
    });

    return result;
  }

  // Abstract methods each scraper must implement
  abstract run(options?: ScrapeOptions): Promise<ScrapeRunSummary>;
  protected abstract discoverCategoryUrls(): Promise<string[]>;
  protected abstract parseProductList(html: string, pageUrl: string): Promise<string[]>;
  protected abstract parseProductPage(html: string, url: string): Promise<ParsedProduct | null>;
}
