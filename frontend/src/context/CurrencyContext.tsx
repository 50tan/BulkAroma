import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrencies, ExchangeRates } from '../lib/api';
import type { CurrencyCode } from '../types';

export const ALL_SUPPORTED_CURRENCIES: CurrencyCode[] = [
  'INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'NZD', 'JPY', 'SGD', 'AED'
];

export const CURRENCY_INFO: Record<CurrencyCode, { symbol: string; name: string; locale: string }> = {
  INR: { symbol: '₹', name: 'Indian Rupee', locale: 'en-IN' },
  USD: { symbol: '$', name: 'US Dollar', locale: 'en-US' },
  EUR: { symbol: '€', name: 'Euro', locale: 'de-DE' },
  GBP: { symbol: '£', name: 'British Pound', locale: 'en-GB' },
  AUD: { symbol: 'A$', name: 'Australian Dollar', locale: 'en-AU' },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar', locale: 'en-CA' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar', locale: 'en-NZ' },
  JPY: { symbol: '¥', name: 'Japanese Yen', locale: 'ja-JP' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar', locale: 'en-SG' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham', locale: 'ar-AE' },
};

interface CurrencyContextValue {
  selectedDisplayCurrency: CurrencyCode;
  setDisplayCurrency: (code: CurrencyCode) => void;
  rates: Record<string, number> | undefined;
  baseCurrency: string;
  isLoadingRates: boolean;
  convertPrice: (amount: number, fromCurrency: string, toCurrency?: CurrencyCode) => number | null;
  formatPrice: (amount: number | null | undefined, currency?: CurrencyCode | string, options?: { showCode?: boolean }) => string;
  formatOriginalPrice: (amount: number | null | undefined, currency: string) => string;
  isDebugMode: boolean;
  setDebugMode: (val: boolean) => void;
}

const CurrencyContext = createContext<CurrencyContextValue | null>(null);

const STORAGE_KEY = 'bulkaroma_display_currency';
const DEFAULT_CURRENCY: CurrencyCode = 'INR';

export function CurrencyProvider({ children }: { children: React.ReactNode }) {
  const [selectedDisplayCurrency, setSelectedDisplayCurrencyState] = useState<CurrencyCode>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as CurrencyCode;
      if (stored && ALL_SUPPORTED_CURRENCIES.includes(stored)) {
        return stored;
      }
    } catch {
      // ignore
    }
    return DEFAULT_CURRENCY;
  });

  const [isDebugMode, setDebugMode] = useState<boolean>(false);

  const setDisplayCurrency = useCallback((code: CurrencyCode) => {
    setSelectedDisplayCurrencyState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
      console.log(`[Currency] Selected: ${code}`);
    } catch {
      // ignore
    }
  }, []);

  // Fetch exchange rates from backend
  const { data: exchangeData, isLoading: isLoadingRates } = useQuery<ExchangeRates>({
    queryKey: ['exchange-rates'],
    queryFn: getCurrencies,
    staleTime: 60 * 60 * 1000, // 1 hour cache
    refetchOnWindowFocus: false,
  });

  const rates = exchangeData?.rates;
  const baseCurrency = exchangeData?.base || 'USD';

  /**
   * Converts an amount from one currency to another using the cached rate table.
   * If from === to, returns amount directly without rounding.
   * If rate cannot be found, returns null (never fake 1:1!).
   */
  const convertPrice = useCallback(
    (amount: number, fromCurrency: string, toCurrency?: CurrencyCode): number | null => {
      const target = toCurrency ?? selectedDisplayCurrency;
      const f = fromCurrency.toUpperCase();
      const t = target.toUpperCase();

      if (f === t) return amount;
      if (!rates) return null;

      const fromRate = rates[f];
      const toRate = rates[t];

      if (fromRate == null || toRate == null || fromRate <= 0) {
        return null;
      }

      // Convert: (amount / fromRate) * toRate
      const result = (amount / fromRate) * toRate;
      return result;
    },
    [rates, selectedDisplayCurrency]
  );

  /**
   * Centralized currency formatter using Intl.NumberFormat.
   * Never hardcodes dynamic symbols.
   */
  const formatPrice = useCallback(
    (
      amount: number | null | undefined,
      currency?: CurrencyCode | string,
      options: { showCode?: boolean } = {}
    ): string => {
      if (amount == null || isNaN(amount)) {
        return 'Conversion unavailable';
      }

      const curr = (currency ?? selectedDisplayCurrency).toUpperCase() as CurrencyCode;
      const info = CURRENCY_INFO[curr];
      const locale = info?.locale ?? 'en-US';

      try {
        const formatted = new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: curr,
          minimumFractionDigits: curr === 'JPY' ? 0 : 2,
          maximumFractionDigits: curr === 'JPY' ? 0 : 2,
        }).format(amount);

        if (options.showCode && !formatted.includes(curr)) {
          return `${formatted} ${curr}`;
        }
        return formatted;
      } catch (err) {
        return `${curr} ${amount.toFixed(2)}`;
      }
    },
    [selectedDisplayCurrency]
  );

  /**
   * Helper to format a supplier's original price with its original source currency.
   */
  const formatOriginalPrice = useCallback(
    (amount: number | null | undefined, sourceCurrency: string): string => {
      if (amount == null || isNaN(amount)) return '—';
      const cleanCurr = (sourceCurrency || 'USD').toUpperCase() as CurrencyCode;
      return formatPrice(amount, cleanCurr, { showCode: true });
    },
    [formatPrice]
  );

  const value = useMemo(
    () => ({
      selectedDisplayCurrency,
      setDisplayCurrency,
      rates,
      baseCurrency,
      isLoadingRates,
      convertPrice,
      formatPrice,
      formatOriginalPrice,
      isDebugMode,
      setDebugMode,
    }),
    [
      selectedDisplayCurrency,
      setDisplayCurrency,
      rates,
      baseCurrency,
      isLoadingRates,
      convertPrice,
      formatPrice,
      formatOriginalPrice,
      isDebugMode,
    ]
  );

  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext);
  if (!context) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
}
