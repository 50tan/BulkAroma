import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Tag,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Breadcrumb from '../components/common/Breadcrumb';
import SearchBar from '../components/search/SearchBar';
import QuantitySelector from '../components/comparison/QuantitySelector';
import CurrencySelector from '../components/comparison/CurrencySelector';
import SupplierCard from '../components/comparison/SupplierCard';
import PurchaseCalculator from '../components/comparison/PurchaseCalculator';
import PriceHistoryChart from '../components/comparison/PriceHistoryChart';
import VariantTable from '../components/comparison/VariantTable';
import ExportControls from '../components/export/ExportControls';
import DataFreshness from '../components/common/DataFreshness';
import { compare } from '../lib/api';
import type { QuantityUnit, CurrencyCode, SupplierCode } from '../types';
import { CURRENCY_SYMBOLS } from '../types';

import { useCurrency } from '../context/CurrencyContext';

const SUPPLIER_ORDER: SupplierCode[] = ['PSH', 'Fraterworks', 'PA'];

export default function ComparisonPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    selectedDisplayCurrency,
    setDisplayCurrency,
    formatPrice,
    formatOriginalPrice,
    isDebugMode,
    setDebugMode,
    rates,
  } = useCurrency();

  const q = searchParams.get('q') ?? '';
  const [quantity, setQuantity] = useState<number>(
    Number(searchParams.get('qty') ?? 100)
  );
  const [unit, setUnit] = useState<QuantityUnit>(
    (searchParams.get('unit') as QuantityUnit) ?? 'g'
  );
  const [showNamesSection, setShowNamesSection] = useState(false);

  // Sync URL params on change
  useEffect(() => {
    setSearchParams(
      {
        ...(q ? { q } : {}),
        qty: String(quantity),
        unit,
        currency: selectedDisplayCurrency,
      },
      { replace: true }
    );
  }, [quantity, unit, selectedDisplayCurrency]);

  const { data, isLoading, isError, error, dataUpdatedAt } = useQuery({
    queryKey: ['comparison', q, quantity, unit, selectedDisplayCurrency],
    queryFn: () =>
      compare({
        query: q,
        quantity,
        unit,
        displayCurrency: selectedDisplayCurrency,
      }),
    enabled: q.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
  });

  // Determine best-value supplier (lowest converted cost for target quantity)
  const bestValueSupplier = React.useMemo(() => {
    if (!data?.suppliers) return null;
    let best: SupplierCode | null = null;
    let bestCost = Infinity;
    data.suppliers.forEach((s) => {
      const cost = s.purchase?.convertedActualCost ?? s.purchase?.actualCost;
      if (cost != null && cost < bestCost) {
        bestCost = cost;
        best = s.supplier;
      }
    });
    return best;
  }, [data]);

  const orderedSuppliers = React.useMemo(() => {
    if (!data?.suppliers) return [];
    return [...data.suppliers].sort(
      (a, b) =>
        SUPPLIER_ORDER.indexOf(a.supplier) - SUPPLIER_ORDER.indexOf(b.supplier)
    );
  }, [data]);

  if (!q) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-semibold text-gray-900 mb-6">
            Compare Raw Material Prices
          </h1>
          <SearchBar />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb
        crumbs={[
          { label: 'Home', to: '/' },
          { label: 'Compare', to: '/compare' },
          ...(data ? [{ label: data.materialName }] : [{ label: q }]),
        ]}
      />

      {/* ── Material Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          {isLoading ? (
            <div className="space-y-2">
              <div className="h-7 bg-gray-200 rounded w-48 animate-pulse" />
              <div className="h-4 bg-gray-100 rounded w-36 animate-pulse" />
            </div>
          ) : data ? (
            <>
              <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                {data.materialName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                {data.casNumber && (
                  <span className="font-mono">CAS {data.casNumber}</span>
                )}
                {data.category && <span>{data.category}</span>}
              </div>
            </>
          ) : (
            <h1 className="text-2xl font-semibold text-gray-900">{q}</h1>
          )}
        </div>
        <DataFreshness
          checkedAt={
            dataUpdatedAt ? new Date(dataUpdatedAt).toISOString() : null
          }
          className="self-start"
        />
      </div>

      {/* ── Supplier Name Aliases ── */}
      {data && (
        <div className="card p-3">
          <button
            onClick={() => setShowNamesSection((v) => !v)}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 w-full"
          >
            <Tag className="w-4 h-4 text-gray-400" />
            <span>
              Names vary across suppliers
            </span>
            {showNamesSection ? (
              <ChevronUp className="w-4 h-4 ml-auto text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 ml-auto text-gray-400" />
            )}
          </button>
          {showNamesSection && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              {orderedSuppliers.map((s) => (
                <div key={s.supplier} className="flex gap-2">
                  <span className="font-semibold text-gray-500 w-24 flex-shrink-0">
                    {s.supplier}:
                  </span>
                  <span className="text-gray-700 italic">{s.productName}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Controls Bar ── */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Compare quantity
            </p>
            <QuantitySelector
              quantity={quantity}
              unit={unit}
              onQuantityChange={setQuantity}
              onUnitChange={setUnit}
            />
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Display currency
            </p>
            <CurrencySelector value={selectedDisplayCurrency} onChange={setDisplayCurrency} />
          </div>
          <div className="sm:self-end pb-1">
            <button
              onClick={() => setDebugMode(!isDebugMode)}
              className={`px-3 py-2 rounded text-xs font-medium border transition-colors ${
                isDebugMode
                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                  : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
              }`}
              title="Toggle FX conversion debug information"
            >
              FX Debug: {isDebugMode ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Currency Debug Panel */}
        {isDebugMode && (
          <div className="mt-3 pt-3 border-t border-gray-100 bg-amber-50/70 rounded-md p-3 text-xs text-amber-950 font-mono space-y-1">
            <div className="flex items-center justify-between font-bold text-amber-900">
              <span>CURRENCY CONVERSION DEBUG PANEL</span>
              <span>Display Currency: {selectedDisplayCurrency}</span>
            </div>
            <p className="text-amber-800">
              Base Currency: USD · Live rates from Open Exchange API &amp; Supabase
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
              {orderedSuppliers.map((s) => {
                const v = s.bestVariant;
                const srcCurr = v?.currency || s.sourceCurrency || (s.supplier === 'Fraterworks' ? 'NZD' : 'USD');
                const rate = s.fxRate ?? (rates && rates[srcCurr] && rates[selectedDisplayCurrency] ? rates[selectedDisplayCurrency] / rates[srcCurr] : 1);
                return (
                  <div key={s.supplier} className="bg-white/80 p-2 rounded border border-amber-200">
                    <span className="font-bold text-gray-900">{s.supplier}</span> ({srcCurr} → {selectedDisplayCurrency}):
                    <div>Rate: 1 {srcCurr} = {rate ? rate.toFixed(4) : '1.0000'} {selectedDisplayCurrency}</div>
                    {v && (
                      <div className="text-gray-600 mt-1">
                        Formula: {formatOriginalPrice(v.listedPrice, srcCurr)} × {rate ? rate.toFixed(4) : '1.0000'} = {formatPrice(v.convertedPrice ?? (v.listedPrice * rate), selectedDisplayCurrency)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Loading / Error ── */}
      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-3 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
          <span className="text-sm">Fetching prices…</span>
        </div>
      )}

      {isError && (
        <div className="card p-6 flex items-start gap-3 border-red-200 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              Failed to load comparison
            </p>
            <p className="text-sm text-red-600 mt-0.5">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        </div>
      )}

      {data && (
        <>
          {/* ── Comparison Table (Desktop) ── */}
          <div className="hidden md:block">
            <h2 className="section-header">Supplier Comparison</h2>
            <div className="card overflow-hidden">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      Supplier
                    </th>
                    <th className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      Product Name
                    </th>
                    <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      Best Pack
                    </th>
                    <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      Listed Price (Source)
                    </th>
                    <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      Converted ({selectedDisplayCurrency})
                    </th>
                    <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      Per 100g ({selectedDisplayCurrency})
                    </th>
                    <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      For {quantity}{unit} ({selectedDisplayCurrency})
                    </th>
                    <th className="table-cell text-center font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      Stock
                    </th>
                    <th className="table-cell text-center font-semibold text-gray-500 text-xs uppercase tracking-wide">
                      Link
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orderedSuppliers.map((s) => {
                    const v = s.bestVariant;
                    const p = s.purchase;
                    const isBest = s.supplier === bestValueSupplier;

                    return (
                      <tr
                        key={s.supplier}
                        className={`hover:bg-gray-50 transition-colors ${
                          isBest ? 'bg-brand-50' : ''
                        }`}
                      >
                        <td className="table-cell">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">
                              {s.supplier}
                            </span>
                            {isBest && (
                              <span className="badge-brand text-xs">Best</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400">
                            {Math.round(s.matchConfidence * 100)}% match
                          </span>
                        </td>
                        <td className="table-cell text-gray-600 max-w-[180px] truncate">
                          {s.productName}
                        </td>
                        <td className="table-cell text-right font-mono text-gray-800">
                          {v ? `${v.quantity}${v.unit}` : '—'}
                        </td>
                        <td className="table-cell text-right font-mono text-gray-900">
                          {v
                            ? formatOriginalPrice(v.listedPrice, v.currency)
                            : '—'}
                        </td>
                        <td className="table-cell text-right font-mono text-gray-900 font-medium">
                          {v?.convertedPrice != null
                            ? formatPrice(v.convertedPrice, selectedDisplayCurrency)
                            : '—'}
                        </td>
                        <td className="table-cell text-right font-mono text-brand-700 font-semibold">
                          {v?.pricePerHundredGrams != null
                            ? formatPrice(v.pricePerHundredGrams, selectedDisplayCurrency)
                            : '—'}
                        </td>
                        <td className="table-cell text-right font-mono">
                          {p ? (
                            <span className="font-semibold text-gray-900">
                              {formatPrice(
                                p.convertedActualCost ?? p.actualCost,
                                selectedDisplayCurrency
                              )}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="table-cell text-center">
                          <span
                            className={
                              v?.availability === 'in_stock'
                                ? 'badge-green'
                                : v?.availability === 'out_of_stock'
                                ? 'badge-red'
                                : 'badge-gray'
                            }
                          >
                            {v?.availability === 'in_stock'
                              ? 'In Stock'
                              : v?.availability === 'out_of_stock'
                              ? 'OOS'
                              : '—'}
                          </span>
                        </td>
                        <td className="table-cell text-center">
                          {v?.sourceUrl ? (
                            <a
                              href={v.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand-600 hover:text-brand-800 transition-colors"
                            >
                              <ExternalLink className="w-4 h-4 mx-auto" />
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Supplier Cards (Mobile + always) ── */}
          <div>
            <h2 className="section-header">Supplier Details</h2>
            <div className="grid grid-cols-1 gap-4">
              {orderedSuppliers.map((s) => (
                <SupplierCard
                  key={s.supplier}
                  data={s}
                  targetQuantity={quantity}
                  targetUnit={unit}
                  displayCurrency={selectedDisplayCurrency}
                  isBestValue={s.supplier === bestValueSupplier}
                />
              ))}
            </div>
          </div>

          {/* ── All Sizes Per Supplier ── */}
          <div>
            <h2 className="section-header">All Available Sizes</h2>
            <div className="space-y-4">
              {orderedSuppliers.map((s) =>
                s.allVariants.length > 0 ? (
                  <div key={s.supplier} className="card overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-sm font-semibold text-gray-800">
                        {s.supplier} — {s.productName}
                      </span>
                      <span className="text-xs text-gray-400">
                        {s.allVariants.length} size
                        {s.allVariants.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <VariantTable
                      variants={s.allVariants}
                      targetQuantity={quantity}
                      targetUnit={unit}
                      displayCurrency={selectedDisplayCurrency}
                    />
                  </div>
                ) : null
              )}
            </div>
          </div>

          {/* ── Purchase Calculator ── */}
          <div>
            <h2 className="section-header">Purchase Calculator</h2>
            <PurchaseCalculator
              suppliers={data.suppliers}
              targetQuantity={quantity}
              targetUnit={unit}
              displayCurrency={selectedDisplayCurrency}
            />
          </div>

          {/* ── Price History ── */}
          <div>
            <h2 className="section-header">Price History</h2>
            <PriceHistoryChart
              history={data.priceHistory}
              displayCurrency={selectedDisplayCurrency}
            />
          </div>

          {/* ── Source Details ── */}
          <div>
            <h2 className="section-header">Source Details</h2>
            <div className="card overflow-hidden">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Supplier
                    </th>
                    <th className="table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Product
                    </th>
                    <th className="table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Variant
                    </th>
                    <th className="table-cell text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Listed Price (Source)
                    </th>
                    <th className="table-cell text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Converted ({selectedDisplayCurrency})
                    </th>
                    <th className="table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Last Checked
                    </th>
                    <th className="table-cell text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {orderedSuppliers.flatMap((s) =>
                    s.allVariants.map((v) => (
                      <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                        <td className="table-cell font-semibold text-gray-700">
                          {s.supplier}
                        </td>
                        <td className="table-cell text-gray-600 max-w-[160px] truncate">
                          {s.productName}
                        </td>
                        <td className="table-cell font-mono text-gray-700">
                          {v.quantity}{v.unit}
                          {v.sku ? ` · ${v.sku}` : ''}
                        </td>
                        <td className="table-cell text-right font-mono text-gray-900">
                          {formatOriginalPrice(v.listedPrice, v.currency)}
                        </td>
                        <td className="table-cell text-right font-mono text-brand-700 font-semibold">
                          {v.convertedPrice != null
                            ? formatPrice(v.convertedPrice, selectedDisplayCurrency)
                            : '—'}
                        </td>
                        <td className="table-cell text-gray-500 text-xs font-mono">
                          {new Date(v.lastCheckedAt).toLocaleDateString()}
                        </td>
                        <td className="table-cell">
                          <a
                            href={v.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-brand-600 hover:text-brand-800 text-xs"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Export ── */}
          <ExportControls materialId={data.materialId} className="mb-8" />
        </>
      )}

      {/* No results state */}
      {!isLoading && !data && q && (
        <div className="text-center py-16">
          <p className="text-gray-500 text-sm mb-2">
            No results found for "{q}"
          </p>
          <p className="text-gray-400 text-xs mb-4">
            Try searching by CAS number or a different name.
          </p>
          <Link to="/common-materials" className="btn-secondary inline-flex">
            Browse Common Materials
          </Link>
        </div>
      )}
    </div>
  );
}
