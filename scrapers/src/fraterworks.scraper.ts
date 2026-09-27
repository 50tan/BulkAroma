import axios from 'axios';
import { BaseScraper, ParsedProduct, ParsedVariant, ScrapeOptions, ScrapeRunSummary } from './base.scraper';
import { normalizeName, parseQuantityString, extractCasNumber } from './normalizer';

const FRATERWORKS_BASE = 'https://fraterworks.com';

const EXCLUDED_TYPES = new Set(['kit', 'formula', 'service', 'accessory', 'miscellaneous', 'equipment']);

export class FraterworksScraper extends BaseScraper {
  constructor() {
    super('fraterworks', FRATERWORKS_BASE, 'NZD');
  }

  async run(options: ScrapeOptions = {}): Promise<ScrapeRunSummary> {
    console.log(`\n[Fraterworks] Starting full catalog crawl...`);
    await this.startScrapeRun();

    try {
      let page = 1;
      let totalFound = 0;
      let totalUpserted = 0;

      while (true) {
        if (options.maxPages && page > options.maxPages) {
          console.log(`[Fraterworks] Reached maxPages limit (${options.maxPages})`);
          break;
        }

        const url = `${FRATERWORKS_BASE}/products.json?limit=250&page=${page}`;
        console.log(`[Fraterworks] Fetching page ${page}...`);

        let data: { products?: Array<Record<string, unknown>> };
        try {
          const res = await axios.get(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'application/json',
            },
            timeout: 25000,
          });
          data = res.data;
        } catch (err) {
          await this.logError(url, 'fetch_error', (err as Error).message);
          break;
        }

        const rawProducts = data?.products || [];
        if (rawProducts.length === 0) {
          console.log(`[Fraterworks] No more products returned at page ${page}.`);
          break;
        }

        totalFound += rawProducts.length;
        console.log(`[Fraterworks] Page ${page}: received ${rawProducts.length} products (cumulative: ${totalFound})`);

        for (const raw of rawProducts) {
          if (options.testMode && totalUpserted >= 5) break;

          const productType = String(raw.product_type || '').trim().toLowerCase();
          if (EXCLUDED_TYPES.has(productType)) {
            continue;
          }

          const parsed = this.parseShopifyProduct(raw);
          if (!parsed) continue;

          try {
            const productId = await this.upsertProduct(parsed);
            if (productId && parsed.variants.length > 0) {
              await this.upsertVariants(productId, parsed.variants);
            }
            totalUpserted++;
          } catch (err) {
            await this.logError(parsed.sourceUrl, 'upsert_error', (err as Error).message);
          }
        }

        if (options.testMode && totalUpserted >= 5) break;
        page++;
        // Small delay between JSON pages
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      this.summary.productsFound = totalFound;
      await this.completeScrapeRun('completed');
      console.log(`[Fraterworks] Crawl complete: ${this.summary.productsUpdated} products updated, ${this.summary.variantsFound} variants, ${this.summary.pricesFound} prices.\n`);
      return this.summary;
    } catch (err) {
      console.error('[Fraterworks] Fatal crawl error:', err);
      await this.completeScrapeRun('failed');
      throw err;
    }
  }

  private parseShopifyProduct(raw: Record<string, unknown>): ParsedProduct | null {
    const title = String(raw.title || '').trim();
    if (!title) return null;

    const handle = String(raw.handle || '');
    const sourceUrl = `${FRATERWORKS_BASE}/products/${handle}`;
    const vendor = String(raw.vendor || '').trim();
    const manufacturer = vendor && vendor !== 'Fraterworks' ? vendor : 'Fraterworks';
    const brand = 'Fraterworks';
    const productType = String(raw.product_type || 'Aromachem').trim();

    // Body description
    const bodyHtml = String(raw.body_html || '');
    const cleanDescription = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Extract CAS number from tags, description, or sku
    const tags = Array.isArray(raw.tags) ? raw.tags.map(String) : [];
    const allText = `${title} ${tags.join(' ')} ${cleanDescription}`;
    let casNumber = extractCasNumber(allText);

    // Variants
    const rawVariants = Array.isArray(raw.variants) ? raw.variants : [];
    const variants: ParsedVariant[] = [];

    for (const v of rawVariants as Array<Record<string, unknown>>) {
      const vTitle = String(v.title || '').trim();
      const sku = v.sku ? String(v.sku).trim() : null;

      // Also check SKU for CAS if not found yet
      if (!casNumber && sku) {
        casNumber = extractCasNumber(sku);
      }

      const priceVal = parseFloat(String(v.price || '0'));
      const available = Boolean(v.available);

      const parsedQty = parseQuantityString(vTitle);
      const qty = parsedQty ? parsedQty.quantity : 1;
      const unit = parsedQty ? parsedQty.unit : 'unit';
      const norm = this.normalizeQuantity(qty, unit);

      variants.push({
        variantName: vTitle,
        quantity: qty,
        unit,
        normalizedQuantityG: norm.grams,
        normalizedQuantityMl: norm.ml,
        sku,
        price: isNaN(priceVal) || priceVal <= 0 ? null : priceVal,
        currency: 'NZD',
        originalPriceText: `NZ$ ${priceVal.toFixed(2)}`,
        availability: available ? 'in_stock' : 'out_of_stock',
      });
    }

    const images = Array.isArray(raw.images) ? (raw.images as Array<Record<string, unknown>>) : [];
    const imageUrl = images.length > 0 ? String(images[0].src || '') : null;

    return {
      supplier: 'fraterworks',
      sourceProductId: String(raw.id || ''),
      originalName: title,
      normalizedName: normalizeName(title),
      manufacturer,
      brand,
      casNumber,
      chemicalName: null,
      sku: variants[0]?.sku || null,
      productType,
      description: cleanDescription.slice(0, 2000),
      sourceUrl,
      imageUrl,
      availability: variants.some((v) => v.availability === 'in_stock') ? 'in_stock' : 'out_of_stock',
      rawMetadata: { shopifyId: raw.id, tags, productType },
      variants,
    };
  }

  // Abstract methods required by BaseScraper
  protected async discoverCategoryUrls(): Promise<string[]> {
    return [`${FRATERWORKS_BASE}/products.json`];
  }

  protected async parseProductList(_html: string, _pageUrl: string): Promise<string[]> {
    return [];
  }

  protected async parseProductPage(_html: string, _url: string): Promise<ParsedProduct | null> {
    return null;
  }
}
