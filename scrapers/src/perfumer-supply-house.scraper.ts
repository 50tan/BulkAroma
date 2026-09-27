import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { BaseScraper, ParsedProduct, ParsedVariant, ScrapeOptions, ScrapeRunSummary } from './base.scraper';
import { normalizeName, parseQuantityString, extractCasNumber } from './normalizer';

const PSH_BASE = 'https://perfumersupplyhouse.com';

const KNOWN_MANUFACTURERS = [
  'Firmenich',
  'IFF',
  'Givaudan',
  'Robertet',
  'Bedoukian',
  'Symrise',
  'Synarome',
  'Takasago',
  'Kao',
  'Ventos',
  'Payan Bertrand',
  'Mane',
  'Vessel',
  'Albert Vieille',
  'PFW',
];

export class PerfumerSupplyHouseScraper extends BaseScraper {
  constructor() {
    super('psh', PSH_BASE, 'USD');
  }

  async run(options: ScrapeOptions = {}): Promise<ScrapeRunSummary> {
    console.log(`\n[PSH] Starting full catalog crawl...`);
    await this.startScrapeRun();

    try {
      // 1. Fetch all products via WooCommerce Store API
      const allStoreProducts: Array<Record<string, unknown>> = [];
      let page = options.startPage || 1;
      const maxPages = options.maxPages ? page + options.maxPages - 1 : Infinity;

      while (true) {
        if (page > maxPages) break;

        const apiUrl = `${PSH_BASE}/wp-json/wc/store/v1/products?per_page=100&page=${page}`;
        console.log(`[PSH] Fetching store API page ${page}...`);

        try {
          const res = await axios.get(apiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'application/json',
            },
            timeout: 25000,
          });

          const items = Array.isArray(res.data) ? res.data : [];
          if (items.length === 0) break;

          allStoreProducts.push(...items);
          console.log(`[PSH] Store API page ${page}: received ${items.length} items (total: ${allStoreProducts.length})`);
          page++;
        } catch (err) {
          console.log(`[PSH] Finished fetching Store API pages at page ${page}.`);
          break;
        }
      }

      this.summary.productsFound = allStoreProducts.length;
      console.log(`[PSH] Discovered ${allStoreProducts.length} total products in catalog.`);

      // 2. Process products with controlled concurrency
      const limit = pLimit(5);
      let count = 0;

      const tasks = allStoreProducts.map((storeProduct) =>
        limit(async () => {
          if (options.testMode && count >= 5) return;

          const permalink = String(storeProduct.permalink || '');
          if (!permalink) return;

          try {
            const product = await this.scrapePshProduct(storeProduct, permalink);
            if (product) {
              const productId = await this.upsertProduct(product);
              if (productId && product.variants.length > 0) {
                await this.upsertVariants(productId, product.variants);
              }
            }

            count++;
            if (count % 25 === 0 || count === allStoreProducts.length) {
              console.log(`  [PSH] Processed ${count}/${allStoreProducts.length} products...`);
              await this.updateCheckpoint({
                processedCount: count,
                totalDiscovered: allStoreProducts.length,
                productsUpdated: this.summary.productsUpdated,
                variantsFound: this.summary.variantsFound,
              });
            }
          } catch (err) {
            await this.logError(permalink, 'product_scrape_error', (err as Error).message);
          }
        })
      );

      await Promise.all(tasks);

      await this.completeScrapeRun('completed');
      console.log(`[PSH] Crawl complete: ${this.summary.productsUpdated} products updated, ${this.summary.variantsFound} variants, ${this.summary.pricesFound} prices.\n`);
      return this.summary;
    } catch (err) {
      console.error('[PSH] Fatal crawl error:', err);
      await this.completeScrapeRun('failed');
      throw err;
    }
  }

  private async scrapePshProduct(storeProduct: Record<string, unknown>, permalink: string): Promise<ParsedProduct | null> {
    const rawName = String(storeProduct.name || '').replace(/&amp;/g, '&').replace(/&#8211;/g, '-').trim();
    if (!rawName) return null;

    // Detect manufacturer from name parentheses e.g. "Exaltenone (Firmenich)"
    let manufacturer: string | null = null;
    const mfgMatch = rawName.match(/\(([^)]+)\)$/);
    if (mfgMatch) {
      manufacturer = mfgMatch[1].trim();
    } else {
      for (const m of KNOWN_MANUFACTURERS) {
        if (rawName.toLowerCase().includes(m.toLowerCase())) {
          manufacturer = m;
          break;
        }
      }
    }

    // Fetch product page to get data-product_variations JSON & detailed description
    let html = '';
    try {
      const res = await axios.get(permalink, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: 20000,
      });
      html = res.data;
    } catch (err) {
      // Fallback: proceed with storeProduct data if HTML fails
      html = '';
    }

    const $ = cheerio.load(html || '');
    const descText = [
      String(storeProduct.description || ''),
      String(storeProduct.short_description || ''),
      $('.woocommerce-product-details__short-description, #tab-description, .product_meta').text(),
    ].join(' ');

    const cleanDescription = descText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Extract CAS
    let casNumber = extractCasNumber(cleanDescription);
    if (!casNumber) {
      // Check for CAS# pattern
      const casMatch = cleanDescription.match(/CAS\s*(?:#|no\.?|number)?[:\s]*([0-9]{2,7}-[0-9]{2}-[0-9])/i);
      if (casMatch) {
        casNumber = casMatch[1].trim();
      }
    }

    const variants: ParsedVariant[] = [];

    // Check for variations JSON in form.variations_form
    const variationsForm = $('form.variations_form');
    const variationsData = variationsForm.attr('data-product_variations');

    if (variationsData) {
      try {
        const parsedVariations = JSON.parse(variationsData);
        if (Array.isArray(parsedVariations)) {
          for (const pv of parsedVariations) {
            const attrs = pv.attributes || {};
            // Usually attribute_pa_qty: "200g"
            let sizeStr = '';
            for (const key of Object.keys(attrs)) {
              if (key.includes('qty') || key.includes('size') || key.includes('weight')) {
                sizeStr = String(attrs[key]);
                break;
              }
            }
            if (!sizeStr && Object.values(attrs).length > 0) {
              sizeStr = String(Object.values(attrs)[0]);
            }

            const parsedQty = parseQuantityString(sizeStr);
            const qty = parsedQty ? parsedQty.quantity : 1;
            const unit = parsedQty ? parsedQty.unit : 'unit';
            const norm = this.normalizeQuantity(qty, unit);

            const priceNum = typeof pv.display_price === 'number' ? pv.display_price : parseFloat(String(pv.display_price || '0'));
            const isAvailable = pv.is_in_stock !== false;

            variants.push({
              variantName: sizeStr || 'Standard',
              quantity: qty,
              unit,
              normalizedQuantityG: norm.grams,
              normalizedQuantityMl: norm.ml,
              sku: pv.sku ? String(pv.sku) : null,
              price: isNaN(priceNum) || priceNum <= 0 ? null : priceNum,
              currency: 'USD',
              originalPriceText: `$${priceNum.toFixed(2)}`,
              availability: isAvailable ? 'in_stock' : 'out_of_stock',
            });
          }
        }
      } catch (err) {
        // ignore parse error and fallback
      }
    }

    // Fallback if no variations JSON was found: check storeProduct prices or HTML prices
    if (variants.length === 0) {
      const prices = (storeProduct.prices as Record<string, unknown>) || {};
      const rawPrice = prices.price ? parseFloat(String(prices.price)) / 100 : null;

      // Extract size from name if present
      const nameParsed = parseQuantityString(rawName);
      const qty = nameParsed ? nameParsed.quantity : 1;
      const unit = nameParsed ? nameParsed.unit : 'unit';
      const norm = this.normalizeQuantity(qty, unit);

      if (rawPrice && rawPrice > 0) {
        variants.push({
          variantName: `${qty} ${unit}`.trim(),
          quantity: qty,
          unit,
          normalizedQuantityG: norm.grams,
          normalizedQuantityMl: norm.ml,
          sku: String(storeProduct.sku || '') || null,
          price: rawPrice,
          currency: 'USD',
          originalPriceText: `$${rawPrice.toFixed(2)}`,
          availability: 'in_stock',
        });
      }
    }

    const images = Array.isArray(storeProduct.images) ? (storeProduct.images as Array<Record<string, unknown>>) : [];
    const imageUrl = images.length > 0 ? String(images[0].src || '') : null;

    return {
      supplier: 'psh',
      sourceProductId: String(storeProduct.id || ''),
      originalName: rawName,
      normalizedName: normalizeName(rawName),
      manufacturer: manufacturer || 'Perfumer Supply House',
      brand: 'Perfumer Supply House',
      casNumber,
      chemicalName: null,
      sku: String(storeProduct.sku || '') || variants[0]?.sku || null,
      productType: 'Aroma Chemical',
      description: cleanDescription.slice(0, 2000),
      sourceUrl: permalink,
      imageUrl,
      availability: variants.some((v) => v.availability === 'in_stock') ? 'in_stock' : 'out_of_stock',
      rawMetadata: { storeId: storeProduct.id, permalink },
      variants,
    };
  }

  // Abstract methods required by BaseScraper
  protected async discoverCategoryUrls(): Promise<string[]> {
    return [`${PSH_BASE}/shop/`];
  }

  protected async parseProductList(_html: string, _pageUrl: string): Promise<string[]> {
    return [];
  }

  protected async parseProductPage(_html: string, _url: string): Promise<ParsedProduct | null> {
    return null;
  }
}
