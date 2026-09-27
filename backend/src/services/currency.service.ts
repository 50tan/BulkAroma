import axios from 'axios';
import { supabase } from '../config/supabase';
import { env } from '../config/env';
import { CurrencyRate } from '../types';

export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'NZD', 'JPY', 'SGD', 'AED'
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// Realistic market fallback rates relative to 1 USD
export const FALLBACK_RATES_USD: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.79,
  INR: 83.5,
  AUD: 1.52,
  CAD: 1.36,
  NZD: 1.63,
  JPY: 155.0,
  SGD: 1.35,
  AED: 3.67,
};

interface CacheEntry {
  rates: Record<string, number>;
  timestamp: number;
}

export class CurrencyService {
  private cache: Map<string, CacheEntry> = new Map();
  private cacheTtlMs = 60 * 60 * 1000; // 1 hour

  /**
   * Returns the exchange rate from → to.
   * Tries in-memory cache, then live API, then database, then market fallback.
   */
  async getRate(from: string, to: string): Promise<number> {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return 1.0;

    const rates = await this.getAllRates('USD');

    const fromRate = rates[f];
    const toRate = rates[t];

    if (fromRate && toRate && fromRate > 0) {
      // (amount / fromRate) * toRate  => rate is toRate / fromRate
      return toRate / fromRate;
    }

    // Try direct stored rates
    const stored = await this.getStoredRate(f, t);
    if (stored !== null) return stored;

    const inverse = await this.getStoredRate(t, f);
    if (inverse !== null && inverse > 0) return 1 / inverse;

    // Use fallback
    const fbFrom = FALLBACK_RATES_USD[f];
    const fbTo = FALLBACK_RATES_USD[t];
    if (fbFrom && fbTo) {
      return fbTo / fbFrom;
    }

    throw new Error(`No exchange rate available for ${from} → ${to}`);
  }

  /**
   * Converts an amount from one currency to another using full precision.
   */
  async convert(amount: number, from: string, to: string): Promise<number> {
    if (from.toUpperCase() === to.toUpperCase()) return amount;
    const rate = await this.getRate(from, to);
    return amount * rate;
  }

  /**
   * Returns all rates relative to baseCurrency (default: USD).
   */
  async getAllRates(baseCurrency = 'USD'): Promise<Record<string, number>> {
    const base = baseCurrency.toUpperCase();
    const cached = this.cache.get(base);
    const now = Date.now();

    if (cached && now - cached.timestamp < this.cacheTtlMs) {
      return cached.rates;
    }

    // Try fetching fresh rates
    let rates: Record<string, number> | null = null;
    try {
      rates = await this.fetchLiveRates(base);
      if (rates) {
        this.cache.set(base, { rates, timestamp: now });
        // Asynchronously persist to Supabase currency_rates table
        this.persistRates(base, rates).catch((err) =>
          console.warn('[CurrencyService] Failed to persist rates:', err.message)
        );
        return rates;
      }
    } catch (err) {
      console.warn(`[CurrencyService] Live rate fetch failed: ${(err as Error).message}`);
    }

    // Try stored rates from Supabase
    try {
      const stored = await this.getStoredRatesMap(base);
      if (Object.keys(stored).length > 3) {
        this.cache.set(base, { rates: stored, timestamp: now });
        return stored;
      }
    } catch (err) {
      console.warn(`[CurrencyService] Stored rate read failed: ${(err as Error).message}`);
    }

    // Fall back to built-in market rates
    const baseUsd = FALLBACK_RATES_USD[base] || 1.0;
    const fallbackMap: Record<string, number> = {};
    for (const [code, usdRate] of Object.entries(FALLBACK_RATES_USD)) {
      fallbackMap[code] = usdRate / baseUsd;
    }

    this.cache.set(base, { rates: fallbackMap, timestamp: now });
    return fallbackMap;
  }

  /**
   * Clears cached rates and forces a fresh rate fetch & persistence.
   */
  async refreshRates(baseCurrency = 'USD'): Promise<Record<string, number>> {
    this.cache.delete(baseCurrency.toUpperCase());
    return this.getAllRates(baseCurrency);
  }

  private async fetchLiveRates(base: string): Promise<Record<string, number>> {
    let rates: Record<string, number> = {};

    if (env.currencyApiKey) {
      const url = `https://v6.exchangerate-api.com/v6/${env.currencyApiKey}/latest/${base}`;
      const { data } = await axios.get<{ conversion_rates: Record<string, number> }>(url, { timeout: 7000 });
      rates = data.conversion_rates || {};
    } else {
      const url = `https://open.er-api.com/v6/latest/${base}`;
      const { data } = await axios.get<{ rates: Record<string, number> }>(url, { timeout: 7000 });
      rates = data.rates || {};
    }

    const filtered: Record<string, number> = {};
    for (const code of SUPPORTED_CURRENCIES) {
      if (typeof rates[code] === 'number') {
        filtered[code] = rates[code];
      }
    }

    return filtered;
  }

  private async persistRates(base: string, rates: Record<string, number>): Promise<void> {
    const nowIso = new Date().toISOString();
    const rows = Object.entries(rates).map(([target, rate]) => ({
      base_currency: base,
      target_currency: target,
      rate,
      observed_at: nowIso,
      provider: env.currencyApiProvider,
    }));

    if (rows.length === 0) return;

    await supabase.from('currency_rates').insert(rows);
  }

  private async getStoredRatesMap(base: string): Promise<Record<string, number>> {
    const { data } = await supabase
      .from('currency_rates')
      .select('target_currency, rate')
      .eq('base_currency', base)
      .order('observed_at', { ascending: false })
      .limit(50);

    const map: Record<string, number> = { [base]: 1.0 };
    for (const row of data || []) {
      if (!map[row.target_currency]) {
        map[row.target_currency] = Number(row.rate);
      }
    }
    return map;
  }

  async getStoredRate(from: string, to: string): Promise<number | null> {
    const { data, error } = await supabase
      .from('currency_rates')
      .select('rate')
      .eq('base_currency', from.toUpperCase())
      .eq('target_currency', to.toUpperCase())
      .order('observed_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return null;
    return Number(data.rate);
  }

  async getAllStoredRates(): Promise<CurrencyRate[]> {
    const { data } = await supabase
      .from('currency_rates')
      .select('*')
      .order('observed_at', { ascending: false })
      .limit(100);

    return (data as CurrencyRate[]) || [];
  }

  getSupportedCurrencies(): string[] {
    return [...SUPPORTED_CURRENCIES];
  }
}

export const currencyService = new CurrencyService();
