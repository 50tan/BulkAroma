import axios from 'axios';
import * as cheerio from 'cheerio';
import { supabase } from '../config/supabase';
import {
  PerfumerSupplyHouseScraper,
  FraterworksScraper,
  PerfumersApprenticeScraper,
  extractCasNumber,
  normalizeName,
  parseQuantityString,
  parsePriceString,
} from '@bulkaroma/scrapers';
import { MatchingService } from './matching.service';

export interface CrawlOptions {
  maxPages?: number;
  testMode?: boolean;
}

export interface CrawlStepParams {
  supplier: 'psh' | 'fraterworks' | 'pa';
  page?: number;
  pageSize?: number;
  jobId?: string;
}

export class CrawlService {
  private matchingService = new MatchingService();

  /**
   * Persists a scrape run record in Supabase BEFORE any crawling begins.
   */
  async createJob(supplier: 'psh' | 'fraterworks' | 'pa') {
    const { data, error } = await supabase
      .from('scrape_runs')
      .insert({
        supplier,
        started_at: new Date().toISOString(),
        status: 'running',
        products_found: 0,
        products_updated: 0,
        variants_found: 0,
        prices_found: 0,
        errors_count: 0,
        blocked_count: 0,
        parser_warnings: [],
      })
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to create scrape run in Supabase for ${supplier}: ${error?.message}`);
    }

    return data;
  }

  /**
   * Synchronous / Bounded Crawl.
   * Creates the job in Supabase first, executes the crawl with bounded pages,
   * awaits full persistence, and completes the job BEFORE returning.
   * Guarantees zero detached background promises in serverless environments.
   */
  async runBoundedCrawl(
    supplier: 'psh' | 'fraterworks' | 'pa' | 'all',
    options: CrawlOptions = { maxPages: 1 }
  ) {
    const suppliers: Array<'psh' | 'fraterworks' | 'pa'> =
      supplier === 'all' ? ['psh', 'fraterworks', 'pa'] : [supplier];

    const results = [];

    for (const s of suppliers) {
      // 1. Create job in Supabase first
      const job = await this.createJob(s);

      // 2. Await scraper execution synchronously
      try {
        if (s === 'psh') {
          const scraper = new PerfumerSupplyHouseScraper();
          (scraper as any).scrapeRunId = job.id;
          await scraper.run(options);
        } else if (s === 'fraterworks') {
          const scraper = new FraterworksScraper();
          (scraper as any).scrapeRunId = job.id;
          await scraper.run(options);
        } else if (s === 'pa') {
          const scraper = new PerfumersApprenticeScraper();
          (scraper as any).scrapeRunId = job.id;
          await scraper.run(options);
        }

        // Fetch finalized run status
        const { data: updated } = await supabase
          .from('scrape_runs')
          .select('*')
          .eq('id', job.id)
          .single();

        results.push(updated || job);
      } catch (err: any) {
        console.error(`[CrawlService] Error executing crawl for ${s}:`, err);
        await supabase
          .from('scrape_runs')
          .update({
            status: 'failed',
            completed_at: new Date().toISOString(),
            parser_warnings: [err.message || 'Scrape execution failed'],
          })
          .eq('id', job.id);

        const { data: failedJob } = await supabase
          .from('scrape_runs')
          .select('*')
          .eq('id', job.id)
          .single();

        results.push(failedJob || job);
      }
    }

    return results;
  }

  /**
   * Atomic chunked stepping crawl.
   * Crawls a single page or batch within the serverless execution window (3-10s).
   * Fully awaits and updates Supabase before returning.
   */
  async crawlStep(params: CrawlStepParams) {
    const { supplier, page = 1, pageSize = 20 } = params;

    // 1. Ensure job exists in Supabase
    let jobId = params.jobId;
    let job: any;

    if (jobId) {
      const { data } = await supabase.from('scrape_runs').select('*').eq('id', jobId).single();
      job = data;
    }

    if (!job) {
      job = await this.createJob(supplier);
      jobId = job.id;
    }

    // 2. Execute bounded page step synchronously
    let hasMore = true;
    let itemsProcessed = 0;
    let variantsFound = 0;

    try {
      if (supplier === 'psh') {
        const res = await axios.get(
          `https://perfumersupplyhouse.com/wp-json/wc/store/v1/products?per_page=${pageSize}&page=${page}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'application/json',
            },
            timeout: 20000,
          }
        );
        const items = Array.isArray(res.data) ? res.data : [];
        itemsProcessed = items.length;
        hasMore = items.length === pageSize;

        for (const item of items) {
          const permalink = String(item.permalink || '');
          if (permalink) {
            try {
              const refreshed = await this.refreshPshProduct(permalink);
              variantsFound += refreshed.variants.length;
            } catch {
              // Non-blocking for single item parse in step
            }
          }
        }
      } else if (supplier === 'fraterworks') {
        const res = await axios.get(
          `https://fraterworks.com/products.json?limit=${pageSize}&page=${page}`,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
              Accept: 'application/json',
            },
            timeout: 20000,
          }
        );
        const rawProducts = res.data?.products || [];
        itemsProcessed = rawProducts.length;
        hasMore = rawProducts.length === pageSize;

        for (const p of rawProducts) {
          const handle = p.handle;
          if (handle) {
            try {
              const refreshed = await this.refreshFraterworksProduct(
                `https://fraterworks.com/products/${handle}`
              );
              variantsFound += refreshed.variants.length;
            } catch {
              // Non-blocking
            }
          }
        }
      } else if (supplier === 'pa') {
        const scraper = new PerfumersApprenticeScraper();
        (scraper as any).scrapeRunId = jobId;
        const summary = await scraper.run({ maxPages: page, startPage: page } as any);
        itemsProcessed = summary.productsFound;
        variantsFound = summary.variantsFound;
        hasMore = false; // PA discovery runs category batch
      }

      // 3. Update scrape_runs in Supabase
      const newProductsFound = (job.products_found || 0) + itemsProcessed;
      const newVariantsFound = (job.variants_found || 0) + variantsFound;
      const status = hasMore ? 'running' : 'completed';

      await supabase
        .from('scrape_runs')
        .update({
          products_found: newProductsFound,
          products_updated: newProductsFound,
          variants_found: newVariantsFound,
          status,
          ...(hasMore ? {} : { completed_at: new Date().toISOString() }),
        })
        .eq('id', jobId);

      return {
        jobId,
        supplier,
        page,
        itemsProcessed,
        productsFound: newProductsFound,
        variantsFound: newVariantsFound,
        hasMore,
        nextPage: hasMore ? page + 1 : null,
        status,
      };
    } catch (err: any) {
      console.error(`[CrawlService] Step error for ${supplier} page ${page}:`, err);
      await supabase
        .from('crawl_errors')
        .insert({
          scrape_run_id: jobId,
          supplier,
          url: `page=${page}`,
          error_type: 'step_error',
          error_message: err.message || 'Error executing step',
        });

      return {
        jobId,
        supplier,
        page,
        itemsProcessed: 0,
        hasMore: false,
        nextPage: null,
        status: 'failed',
        error: err.message,
      };
    }
  }

  /**
   * Get status of a crawl run.
   */
  async getStatus(runId: string) {
    const [runRes, errorsRes] = await Promise.all([
      supabase.from('scrape_runs').select('*').eq('id', runId).single(),
      supabase
        .from('crawl_errors')
        .select('*')
        .eq('scrape_run_id', runId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (!runRes.data) {
      return null;
    }

    return {
      run: runRes.data,
      errors: errorsRes.data || [],
    };
  }

  /**
   * List recent crawl runs.
   */
  async getRecent(supplier?: string, limit = 20) {
    let query = supabase
      .from('scrape_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (supplier) {
      query = query.eq('supplier', supplier.toLowerCase());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  /**
   * Single product fast refresh on-demand.
   * Scrapes a single URL, upserts product, variants, and latest price observation.
   */
  async refreshProduct(productUrl: string) {
    const urlObj = new URL(productUrl);
    const host = urlObj.hostname.toLowerCase();

    if (host.includes('perfumersupplyhouse.com')) {
      return this.refreshPshProduct(productUrl);
    } else if (host.includes('fraterworks.com')) {
      return this.refreshFraterworksProduct(productUrl);
    } else if (host.includes('perfumersapprentice.com')) {
      return this.refreshPaProduct(productUrl);
    } else {
      throw new Error(`Unsupported supplier domain: ${host}`);
    }
  }

  private async refreshPshProduct(url: string) {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      timeout: 20000,
    });

    const $ = cheerio.load(html);
    const title = $('h1.product_title').text().trim() || $('h1').first().text().trim();
    if (!title) throw new Error('Could not find product title on page');

    const desc = $('.woocommerce-product-details__short-description, #tab-description').text();
    const casNumber = extractCasNumber(desc) || extractCasNumber(title);

    const variationsForm = $('form.variations_form');
    const variationsJson = variationsForm.attr('data-product_variations');

    const variants: Array<{
      variantName: string;
      quantity: number;
      unit: string;
      price: number;
      sku?: string;
    }> = [];

    if (variationsJson) {
      try {
        const rawVars = JSON.parse(variationsJson);
        for (const rv of rawVars) {
          const vName = Object.values(rv.attributes || {}).join(' ') || rv.sku || 'Default';
          const price = Number(rv.display_price);
          const pq = parseQuantityString(vName);
          if (price > 0 && pq) {
            variants.push({
              variantName: vName,
              quantity: pq.quantity,
              unit: pq.unit,
              price,
              sku: rv.sku,
            });
          }
        }
      } catch (e) {
        console.warn('Failed to parse variation json', e);
      }
    }

    if (variants.length === 0) {
      const priceText = $('.price .woocommerce-Price-amount').first().text();
      const parsedPrice = parsePriceString(priceText);
      const pq = parseQuantityString(title) || { quantity: 1, unit: 'piece' };
      if (parsedPrice) {
        variants.push({
          variantName: 'Standard',
          quantity: pq.quantity,
          unit: pq.unit,
          price: parsedPrice.amount,
        });
      }
    }

    return this.persistSingleProduct({
      supplier: 'psh',
      originalName: title,
      sourceUrl: url,
      casNumber,
      currency: 'USD',
      description: desc.trim().slice(0, 500),
      variants,
    });
  }

  private async refreshFraterworksProduct(url: string) {
    const match = url.match(/\/products\/([a-zA-Z0-9-_]+)/);
    const handle = match ? match[1] : null;

    let productJson: any = null;
    if (handle) {
      try {
        const jsonUrl = `https://fraterworks.com/products/${handle}.js`;
        const res = await axios.get(jsonUrl, { timeout: 15000 });
        productJson = res.data;
      } catch {
        // Fallback to HTML
      }
    }

    if (!productJson) {
      const { data: html } = await axios.get(url, { timeout: 20000 });
      const $ = cheerio.load(html);
      const title = $('h1').first().text().trim();
      const priceText = $('.price').first().text();
      const parsed = parsePriceString(priceText);
      productJson = {
        title,
        description: $('meta[name="description"]').attr('content') || '',
        variants: [
          {
            title: 'Standard',
            price: parsed ? parsed.amount * 100 : 0,
          },
        ],
      };
    }

    const casNumber =
      extractCasNumber(productJson.description || '') ||
      extractCasNumber(productJson.title || '');

    const variants = (productJson.variants || [])
      .map((v: any) => {
        const pq = parseQuantityString(v.title) || { quantity: 1, unit: 'piece' };
        const price = (Number(v.price) || 0) / 100;
        return {
          variantName: v.title,
          quantity: pq.quantity,
          unit: pq.unit,
          price,
          sku: v.sku,
        };
      })
      .filter((v: any) => v.price > 0);

    return this.persistSingleProduct({
      supplier: 'fraterworks',
      originalName: productJson.title,
      sourceUrl: url,
      casNumber,
      currency: 'NZD',
      description: (productJson.description || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 500),
      variants,
    });
  }

  private async refreshPaProduct(url: string) {
    const { data: html } = await axios.get(url, { timeout: 20000 });
    const $ = cheerio.load(html);
    const title = $('h1').first().text().trim();
    if (!title) throw new Error('Could not find product title on PA page');

    const desc = $('.product-description, #description, .description').text() || $('body').text();
    const casNumber = extractCasNumber(desc) || extractCasNumber(title);

    const variants: Array<{
      variantName: string;
      quantity: number;
      unit: string;
      price: number;
      sku?: string;
    }> = [];

    $('select[name*="option"] option, .variant-option, table.variations tr').each((_, el) => {
      const text = $(el).text();
      const pq = parseQuantityString(text);
      const pr = parsePriceString(text);
      if (pq && pr) {
        variants.push({
          variantName: text.trim(),
          quantity: pq.quantity,
          unit: pq.unit,
          price: pr.amount,
        });
      }
    });

    if (variants.length === 0) {
      const priceText = $('.price, .product-price').first().text();
      const pr = parsePriceString(priceText);
      const pq = parseQuantityString(title) || { quantity: 1, unit: 'piece' };
      if (pr) {
        variants.push({
          variantName: 'Standard',
          quantity: pq.quantity,
          unit: pq.unit,
          price: pr.amount,
        });
      }
    }

    return this.persistSingleProduct({
      supplier: 'pa',
      originalName: title,
      sourceUrl: url,
      casNumber,
      currency: 'USD',
      description: desc.trim().slice(0, 500),
      variants,
    });
  }

  private async persistSingleProduct(data: {
    supplier: 'psh' | 'fraterworks' | 'pa';
    originalName: string;
    sourceUrl: string;
    casNumber: string | null;
    currency: string;
    description: string;
    variants: Array<{
      variantName: string;
      quantity: number;
      unit: string;
      price: number;
      sku?: string;
    }>;
  }) {
    const normalizedName = normalizeName(data.originalName);

    const { data: product, error: prodErr } = await supabase
      .from('supplier_products')
      .upsert(
        {
          supplier: data.supplier,
          original_name: data.originalName,
          normalized_name: normalizedName,
          cas_number: data.casNumber,
          source_url: data.sourceUrl,
          description: data.description,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'supplier,source_url' }
      )
      .select()
      .single();

    if (prodErr || !product) {
      throw new Error(`Failed to upsert product: ${prodErr?.message}`);
    }

    const savedVariants = [];
    for (const v of data.variants) {
      const { data: variant, error: varErr } = await supabase
        .from('product_variants')
        .upsert(
          {
            supplier_product_id: product.id,
            variant_name: v.variantName,
            quantity: v.quantity,
            unit: v.unit,
            normalized_quantity_g: ['g', 'kg', 'mg', 'oz', 'lb'].includes(v.unit) ? v.quantity : null,
            normalized_quantity_ml: ['ml', 'l', 'fl_oz'].includes(v.unit) ? v.quantity : null,
            sku: v.sku || null,
          },
          { onConflict: 'supplier_product_id,variant_name' }
        )
        .select()
        .single();

      if (variant) {
        savedVariants.push(variant);
        await supabase.from('price_observations').insert({
          product_variant_id: variant.id,
          price_amount: v.price,
          currency: data.currency,
          original_price_text: `${data.currency} ${v.price}`,
          observed_at: new Date().toISOString(),
          source_url: data.sourceUrl,
        });
      }
    }

    if (!product.canonical_material_id) {
      try {
        const matches = await this.matchingService.findMatches(product as any);
        if (matches.length > 0 && matches[0].confidence >= 0.85) {
          await supabase
            .from('supplier_products')
            .update({ canonical_material_id: matches[0].material_id })
            .eq('id', product.id);
          product.canonical_material_id = matches[0].material_id;
        }
      } catch (e) {
        console.warn('Match service warning during single refresh:', e);
      }
    }

    return {
      product,
      variants: savedVariants,
    };
  }
}
