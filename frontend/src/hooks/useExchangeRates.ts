import { useQuery } from '@tanstack/react-query';
import { getCurrencies } from '../lib/api';
import type { CurrencyCode } from '../types';

interface UseExchangeRatesReturn {
  rates: Record<string, number> | undefined;
  base: string | undefined;
  isLoading: boolean;
  convert: (amount: number, from: string, to: CurrencyCode) => number | null;
}

/**
 * Fetches exchange rates from the backend (cached 1 hour).
 * Provides a local `convert` function so currency switching is instant.
 */
export function useExchangeRates(): UseExchangeRatesReturn {
  const { data, isLoading } = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: getCurrencies,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: 2,
  });

  function convert(
    amount: number,
    from: string,
    to: CurrencyCode
  ): number | null {
    if (!data?.rates) return null;
    if (from === to) return amount;

    // Rates are expressed relative to data.base
    const fromRate = data.rates[from] ?? null;
    const toRate = data.rates[to] ?? null;
    if (fromRate == null || toRate == null) return null;

    // Convert: amount → base → to
    return (amount / fromRate) * toRate;
  }

  return {
    rates: data?.rates,
    base: data?.base,
    isLoading,
    convert,
  };
}
