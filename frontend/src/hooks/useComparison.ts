import { useState, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { compare } from '../lib/api';
import { UNIT_TO_GRAMS } from '../types';
import type {
  QuantityUnit,
  CurrencyCode,
  ComparisonResult,
  SupplierComparison,
} from '../types';

interface UseComparisonOptions {
  initialQuery?: string;
  initialQuantity?: number;
  initialUnit?: QuantityUnit;
  initialCurrency?: CurrencyCode;
}

interface UseComparisonReturn {
  query: string;
  quantity: number;
  unit: QuantityUnit;
  currency: CurrencyCode;
  result: ComparisonResult | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  setQuery: (q: string) => void;
  updateQuantity: (qty: number) => void;
  updateUnit: (u: QuantityUnit) => void;
  updateCurrency: (c: CurrencyCode) => void;
  refetch: () => void;
  sortedSuppliers: SupplierComparison[];
}

export function useComparison(opts: UseComparisonOptions = {}): UseComparisonReturn {
  const [query, setQuery] = useState(opts.initialQuery ?? '');
  const [quantity, setQuantity] = useState(opts.initialQuantity ?? 100);
  const [unit, setUnit] = useState<QuantityUnit>(opts.initialUnit ?? 'g');
  const [currency, setCurrency] = useState<CurrencyCode>(opts.initialCurrency ?? 'USD');

  const enabled = query.trim().length >= 2;

  const {
    data: result,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['comparison', query, quantity, unit, currency],
    queryFn: () =>
      compare({ query, quantity, unit, displayCurrency: currency }),
    enabled,
    staleTime: 5 * 60 * 1000,
  });

  const updateQuantity = useCallback((qty: number) => {
    if (qty > 0) setQuantity(qty);
  }, []);

  const updateUnit = useCallback((u: QuantityUnit) => {
    setUnit(u);
  }, []);

  const updateCurrency = useCallback((c: CurrencyCode) => {
    setCurrency(c);
  }, []);

  // Sort suppliers: highest confidence → best price per 100g
  const sortedSuppliers = useMemo<SupplierComparison[]>(() => {
    if (!result?.suppliers) return [];
    return [...result.suppliers].sort((a, b) => {
      if (b.matchConfidence !== a.matchConfidence) {
        return b.matchConfidence - a.matchConfidence;
      }
      const aPer = a.bestVariant?.pricePerHundredGrams ?? Infinity;
      const bPer = b.bestVariant?.pricePerHundredGrams ?? Infinity;
      return aPer - bPer;
    });
  }, [result]);

  return {
    query,
    quantity,
    unit,
    currency,
    result,
    isLoading,
    isError,
    error: error as Error | null,
    setQuery,
    updateQuantity,
    updateUnit,
    updateCurrency,
    refetch,
    sortedSuppliers,
  };
}
