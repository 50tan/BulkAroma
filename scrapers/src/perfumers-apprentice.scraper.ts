import axios from 'axios';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { BaseScraper, ParsedProduct, ParsedVariant, ScrapeOptions, ScrapeRunSummary } from './base.scraper';
import { normalizeName, parseQuantityString, extractCasNumber } from './normalizer';

const PA_BASE = 'https://shop.perfumersapprentice.com';

const PAGERANGES = ['0-B', 'C-D', 'E-G', 'H-K', 'L-N', 'O-R', 'S-Z'];

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
  'BASF',
  'Vessel',
  'Albert Vieille',
  'PFW',
];

export class PerfumersApprenticeScraper extends BaseScraper {
  constructor() {
    super('pa', PA_BASE, 'USD');
  }

  async run(options: ScrapeOptions = {}): Promise<ScrapeRunSummary> {
    console.log(`\n[PA] Starting full fragrance catalog crawl...`);
    await this.startScrapeRun();

    try {
      // 1. Discover all fragrance product URLs from the 7 category range pages
      const productUrls = new Set<string>();

      const startIdx = options.startPage ? Math.max(0, options.startPage - 1) : 0;
      const maxRanges = options.maxPages ? options.maxPages : PAGERANGES.length;
      const rangesToCrawl = PAGERANGES.slice(startIdx, startIdx + maxRanges);

      for (const range of rangesToCrawl) {
        const catUrl = `${PA_BASE}/c-244-all-fragrance-ingredients.aspx?pagerange=${range}`;
        console.log(`[PA] Discovering products in range: ${range}...`);

        try {
          const res = await axios.get(catUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml',
            },
            timeout: 25000,
          });

          const $ = cheerio.load(res.data);
          let rangeCount = 0;

          $('a[href*="/p-"], a[href^="p-"]').each((_, el) => {
            const href = $(el).attr('href');
            if (href) {
              const fullUrl = href.startsWith('http') ? href : `${PA_BASE}/${href.replace(/^\//, '')}`;
              // Filter to actual product pages
              if (fullUrl.includes('/p-') && !fullUrl.includes('tabid=') && !productUrls.has(fullUrl)) {
                productUrls.add(fullUrl);
                rangeCount++;
              }
            }
          });

          console.log(`[PA] Range ${range}: found ${rangeCount} products (total unique: ${productUrls.size})`);
        } catch (err) {
          await this.logError(catUrl, 'category_crawl_error', (err as Error).message);
        }
      }

      this.summary.productsFound = productUrls.size;
      console.log(`[PA] Total unique fragrance products discovered: ${productUrls.size}`);

      // 2. Process products with bounded concurrency
      const limit = pLimit(6);
      let count = 0;
      const urlList = Array.from(productUrls);

      const tasks = urlList.map((prodUrl) =>
        limit(async () => {
          if (options.testMode && count >= 5) return;

          try {
            const html = await this.fetchWithRetry(prodUrl);
            if (html) {
              const product = this.parseProductPageHtml(html, prodUrl);
              if (product) {
                const productId = await this.upsertProduct(product);
                if (productId && product.variants.length > 0) {
                  await this.upsertVariants(productId, product.variants);
                }
              }
            }

            count++;
            if (count % 25 === 0 || count === urlList.length) {
              console.log(`  [PA] Processed ${count}/${urlList.length} products...`);
              await this.updateCheckpoint({
                processedCount: count,
                totalDiscovered: urlList.length,
                productsUpdated: this.summary.productsUpdated,
                variantsFound: this.summary.variantsFound,
              });
            }
          } catch (err) {
            await this.logError(prodUrl, 'product_scrape_error', (err as Error).message);
          }
        })
      );

      await Promise.all(tasks);

      await this.completeScrapeRun('completed');
      console.log(`[PA] Crawl complete: ${this.summary.productsUpdated} products updated, ${this.summary.variantsFound} variants, ${this.summary.pricesFound} prices.\n`);
      return this.summary;
    } catch (err) {
      console.error('[PA] Fatal crawl error:', err);
      await this.completeScrapeRun('failed');
      throw err;
    }
  }

  private async fetchWithRetry(url: string, retries = 3): Promise<string | null> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
          timeout: 20000,
        });
        return res.data;
      } catch (err) {
        if (attempt === retries) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
    return null;
  }

  private parseProductPageHtml(html: string, url: string): ParsedProduct | null {
    const $ = cheerio.load(html);

    // Title
    const title = $('h1.product-title, .productnamecolor, h1').first().text().trim();
    if (!title) return null;

    // Detect manufacturer
    let manufacturer: string | null = null;
    const mfgMatch = title.match(/\(([^)]+)\)$/);
    if (mfgMatch) {
      manufacturer = mfgMatch[1].trim();
    } else {
      for (const m of KNOWN_MANUFACTURERS) {
        if (title.toLowerCase().includes(m.toLowerCase())) {
          manufacturer = m;
          break;
        }
      }
    }

    // Description & CAS
    const descText = $('.product-description, #product-details, .description, body').text();
    const cleanDescription = $('.product-description, #product-details, .description').text().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    let casNumber = extractCasNumber(descText);
    if (!casNumber) {
      const casMatch = descText.match(/CAS\s*(?:#|no\.?|number)?[:\s]*([0-9]{2,7}-[0-9]{2}-[0-9])/i);
      if (casMatch) {
        casNumber = casMatch[1].trim();
      }
    }

    // Variants from .panel-body.row
    const variants: ParsedVariant[] = [];

    $('.panel-body.row, .variant-row').each((_, el) => {
      const row = $(el);
      const nameEl = row.find('.variant-name-wrap h4, .variant-name-wrap, .grid-item-name-wrap');
      const vName = nameEl.first().text().trim();
      if (!vName) return;

      // Extract price from meta tag or text
      let priceVal: number | null = null;
      const metaPrice = row.find('meta[itemprop="price"]').attr('content');
      if (metaPrice) {
        priceVal = parseFloat(metaPrice);
      } else {
        const priceText = row.find('.variant-price, .price-wrap').text();
        const m = priceText.match(/\$([0-9,.]+)/);
        if (m) {
          priceVal = parseFloat(m[1].replace(/,/g, ''));
        }
      }

      // Check availability
      const rowText = row.text().toLowerCase();
      const isOutOfStock = rowText.includes('out of stock') || rowText.includes('backorder');

      const sku = row.find('[itemprop="mpn"], [itemprop="sku"]').attr('content') || row.find('.sku').text().trim() || null;

      const parsedQty = parseQuantityString(vName);
      const qty = parsedQty ? parsedQty.quantity : 1;
      const unit = parsedQty ? parsedQty.unit : 'unit';
      const norm = this.normalizeQuantity(qty, unit);

      variants.push({
        variantName: vName,
        quantity: qty,
        unit,
        normalizedQuantityG: norm.grams,
        normalizedQuantityMl: norm.ml,
        sku,
        price: isNaN(priceVal!) || !priceVal || priceVal <= 0 ? null : priceVal,
        currency: 'USD',
        originalPriceText: priceVal ? `$${priceVal.toFixed(2)}` : 'N/A',
        availability: isOutOfStock ? 'out_of_stock' : 'in_stock',
      });
    });

    // Fallback: dropdown or general prices if no panel-body rows found
    if (variants.length === 0) {
      $('select[name*="Variant"] option').each((_, el) => {
        const optText = $(el).text().trim();
        const priceMatch = optText.match(/\$([0-9,.]+)/);
        const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;

        const parsedQty = parseQuantityString(optText);
        const qty = parsedQty ? parsedQty.quantity : 1;
        const unit = parsedQty ? parsedQty.unit : 'unit';
        const norm = this.normalizeQuantity(qty, unit);

        variants.push({
          variantName: optText,
          quantity: qty,
          unit,
          normalizedQuantityG: norm.grams,
          normalizedQuantityMl: norm.ml,
          sku: null,
          price,
          currency: 'USD',
          originalPriceText: price ? `$${price.toFixed(2)}` : optText,
          availability: 'in_stock',
        });
      });
    }

    const imageUrl = $('meta[property="og:image"]').attr('content') || $('.product-image img').first().attr('src') || null;

    return {
      supplier: 'pa',
      sourceProductId: url.split('/p-')[1]?.split('-')[0] || null,
      originalName: title,
      normalizedName: normalizeName(title),
      manufacturer: manufacturer || "The Perfumer's Apprentice",
      brand: "The Perfumer's Apprentice",
      casNumber,
      chemicalName: null,
      sku: variants[0]?.sku || null,
      productType: 'Fragrance Ingredient',
      description: cleanDescription.slice(0, 2000),
      sourceUrl: url,
      imageUrl,
      availability: variants.some((v) => v.availability === 'in_stock') ? 'in_stock' : 'out_of_stock',
      rawMetadata: { url },
      variants,
    };
  }

  // Abstract methods required by BaseScraper
  protected async discoverCategoryUrls(): Promise<string[]> {
    return PAGERANGES.map((r) => `${PA_BASE}/c-244-all-fragrance-ingredients.aspx?pagerange=${r}`);
  }

  protected async parseProductList(_html: string, _pageUrl: string): Promise<string[]> {
    return [];
  }

  protected async parseProductPage(_html: string, _url: string): Promise<ParsedProduct | null> {
    return null;
  }
}
