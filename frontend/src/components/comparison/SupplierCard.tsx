import React from 'react';
import { ExternalLink, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { useState } from 'react';
import type {
  SupplierComparison,
  CurrencyCode,
  QuantityUnit,
} from '../../types';
import { calcPurchase } from '../../hooks/usePurchaseCalculator';
import { useCurrency } from '../../context/CurrencyContext';
import VariantTable from './VariantTable';
import MatchExplanation from './MatchExplanation';

const SUPPLIER_LABELS: Record<string, string> = {
  PSH: 'Perfumer Supply House',
  Fraterworks: 'Fraterworks',
  PA: "The Perfumer's Apprentice",
};

interface SupplierCardProps {
  data: SupplierComparison;
  targetQuantity: number;
  targetUnit: QuantityUnit;
  displayCurrency?: CurrencyCode;
  isBestValue?: boolean;
}

export default function SupplierCard({
  data,
  targetQuantity,
  targetUnit,
  displayCurrency,
  isBestValue = false,
}: SupplierCardProps) {
  const [showVariants, setShowVariants] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  const {
    selectedDisplayCurrency,
    formatPrice,
    formatOriginalPrice,
    convertPrice,
  } = useCurrency();

  const activeCurrency = displayCurrency ?? selectedDisplayCurrency;
  const { bestVariant, supplier, productName, matchConfidence } = data;

  const purchase =
    data.purchase ??
    (bestVariant
      ? calcPurchase(
          targetQuantity,
          targetUnit,
          bestVariant.quantity,
          bestVariant.unit,
          bestVariant.listedPrice,
          bestVariant.currency
        )
      : null);

  const convertedCost =
    data.purchase?.convertedActualCost ??
    (purchase && bestVariant
      ? convertPrice(purchase.actualCost, purchase.actualCostCurrency, activeCurrency)
      : null);

  const convertedPer100g =
    bestVariant?.pricePerHundredGrams ??
    (bestVariant?.normalizedPrices?.per100g ??
      (bestVariant?.normalizedPrices?.originalPer100g
        ? convertPrice(bestVariant.normalizedPrices.originalPer100g, bestVariant.currency, activeCurrency)
        : null));

  const convertedBestPrice =
    bestVariant?.convertedPrice ??
    (bestVariant
      ? convertPrice(bestVariant.listedPrice, bestVariant.currency, activeCurrency)
      : null);

  const pct = Math.round(matchConfidence * 100);
  const confidenceBadge =
    pct >= 90 ? 'badge-green' : pct >= 70 ? 'badge-yellow' : 'badge-red';

  const stockBadge =
    bestVariant?.availability === 'in_stock'
      ? 'badge-green'
      : bestVariant?.availability === 'out_of_stock'
      ? 'badge-red'
      : 'badge-gray';

  const stockLabel =
    bestVariant?.availability === 'in_stock'
      ? 'In Stock'
      : bestVariant?.availability === 'out_of_stock'
      ? 'Out of Stock'
      : 'Unknown';

  return (
    <div
      className={`card overflow-hidden ${
        isBestValue ? 'ring-2 ring-brand-500' : ''
      }`}
    >
      {/* Best value banner */}
      {isBestValue && (
        <div className="bg-brand-600 text-white text-xs font-semibold px-4 py-1.5 text-center tracking-wide">
          BEST VALUE FOR {targetQuantity}{targetUnit}
        </div>
      )}

      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                {supplier}
              </span>
              <span className={confidenceBadge}>{pct}% match</span>
              <span className={stockBadge}>{stockLabel}</span>
            </div>
            <p className="mt-1 text-sm font-semibold text-gray-900 leading-snug">
              {SUPPLIER_LABELS[supplier] || supplier}
            </p>
            <p className="text-xs text-gray-500 mt-0.5 italic">{productName}</p>
          </div>
        </div>

        {bestVariant ? (
          <>
            {/* Price block */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 rounded-md p-3 mb-3">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Listed Price (Source)</p>
                <p className="text-base font-semibold text-gray-900 font-mono">
                  {formatOriginalPrice(bestVariant.listedPrice, bestVariant.currency)}
                  <span className="text-xs font-normal text-gray-500 ml-1">
                    / {bestVariant.quantity}{bestVariant.unit}
                  </span>
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">
                  Converted ({activeCurrency})
                </p>
                <p className="text-base font-semibold text-gray-900 font-mono">
                  {convertedBestPrice != null
                    ? formatPrice(convertedBestPrice, activeCurrency)
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-0.5">
                  Per 100g ({activeCurrency})
                </p>
                <p className="text-base font-semibold text-brand-700 font-mono">
                  {convertedPer100g != null
                    ? formatPrice(convertedPer100g, activeCurrency)
                    : '—'}
                </p>
              </div>
            </div>

            {/* Purchase cost */}
            {purchase && (
              <div className="border border-gray-100 rounded-md p-3 mb-3 text-sm">
                <p className="text-xs text-gray-400 font-medium mb-1.5 uppercase tracking-wide">
                  Purchase for {targetQuantity}{targetUnit}
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-semibold text-gray-900 font-mono text-lg">
                    {purchase.packagesRequired} ×{' '}
                    {bestVariant.quantity}{bestVariant.unit}
                  </span>
                  <span className="text-gray-500 text-xs">packages</span>
                </div>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  <span className="font-mono text-gray-600 text-sm">
                    Original: {formatOriginalPrice(purchase.actualCost, purchase.actualCostCurrency)}
                  </span>
                  {convertedCost != null && (
                    <span className="text-base font-bold text-brand-700 font-mono">
                      ≈ {formatPrice(convertedCost, activeCurrency)}
                    </span>
                  )}
                </div>
                {purchase.excessQuantity > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    {purchase.actualQuantityPurchased.toFixed(0)}g purchased ·{' '}
                    {purchase.excessQuantity.toFixed(0)}g excess
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={bestVariant.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary flex items-center gap-1.5 py-1.5 text-xs"
              >
                Buy on {supplier}
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => setShowVariants((v) => !v)}
                className="btn-ghost flex items-center gap-1 text-xs"
              >
                All sizes
                {showVariants ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setShowMatch((v) => !v)}
                className="btn-ghost flex items-center gap-1 text-xs"
              >
                <Info className="w-3.5 h-3.5" />
                Why matched?
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-400 italic py-2">
            No variants available.
          </p>
        )}
      </div>

      {/* Expanded: variant table */}
      {showVariants && data.allVariants.length > 0 && (
        <div className="border-t border-gray-100">
          <VariantTable
            variants={data.allVariants}
            targetQuantity={targetQuantity}
            targetUnit={targetUnit}
            displayCurrency={displayCurrency}
          />
        </div>
      )}

      {/* Expanded: match explanation */}
      {showMatch && (
        <div className="border-t border-gray-100 p-4">
          <MatchExplanation
            evidence={data.matchEvidence}
            confidence={data.matchConfidence}
            supplierProductName={data.productName}
          />
        </div>
      )}
    </div>
  );
}
