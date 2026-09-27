import React from 'react';
import { Star } from 'lucide-react';
import type { Variant, QuantityUnit, CurrencyCode } from '../../types';
import { UNIT_TO_GRAMS } from '../../types';
import { useCurrency } from '../../context/CurrencyContext';

interface VariantTableProps {
  variants: Variant[];
  targetQuantity: number;
  targetUnit: QuantityUnit;
  displayCurrency?: CurrencyCode;
}

export default function VariantTable({
  variants,
  targetQuantity,
  targetUnit,
  displayCurrency,
}: VariantTableProps) {
  const {
    selectedDisplayCurrency,
    formatPrice,
    formatOriginalPrice,
    convertPrice,
  } = useCurrency();

  const activeCurrency = displayCurrency ?? selectedDisplayCurrency;
  const targetGrams = targetQuantity * UNIT_TO_GRAMS[targetUnit];

  // Find most economical variant by per-100g price
  let cheapestIdx = -1;
  let cheapestPer100g = Infinity;
  variants.forEach((v, i) => {
    const p100 =
      v.pricePerHundredGrams ??
      v.normalizedPrices?.per100g ??
      (v.normalizedPrices?.originalPer100g
        ? convertPrice(v.normalizedPrices.originalPer100g, v.currency, activeCurrency)
        : null);
    if (p100 != null && p100 < cheapestPer100g) {
      cheapestPer100g = p100;
      cheapestIdx = i;
    }
  });

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Size
            </th>
            <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Listed Price (Source)
            </th>
            <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Converted ({activeCurrency})
            </th>
            <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
              / 100g ({activeCurrency})
            </th>
            <th className="table-cell text-center font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Stock
            </th>
            <th className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
              SKU
            </th>
            <th className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
              Type
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {variants.map((v, i) => {
            const isCheapest = i === cheapestIdx;
            const variantGrams = v.quantity * UNIT_TO_GRAMS[v.unit];

            const convertedPrice =
              v.convertedPrice ??
              convertPrice(v.listedPrice, v.currency, activeCurrency);

            const per100g =
              v.pricePerHundredGrams ??
              v.normalizedPrices?.per100g ??
              (v.normalizedPrices?.originalPer100g
                ? convertPrice(v.normalizedPrices.originalPer100g, v.currency, activeCurrency)
                : null);

            return (
              <tr
                key={v.id}
                className={`hover:bg-gray-50 transition-colors ${
                  isCheapest ? 'bg-brand-50' : ''
                }`}
              >
                <td className="table-cell font-mono font-medium text-gray-900">
                  <div className="flex items-center gap-1.5">
                    {isCheapest && (
                      <Star className="w-3 h-3 text-brand-500 fill-brand-500 flex-shrink-0" />
                    )}
                    {v.quantity}
                    {v.unit}
                  </div>
                </td>
                <td className="table-cell text-right font-mono text-gray-800">
                  {formatOriginalPrice(v.listedPrice, v.currency)}
                </td>
                <td className="table-cell text-right font-mono text-gray-900 font-medium">
                  {convertedPrice != null
                    ? formatPrice(convertedPrice, activeCurrency)
                    : '—'}
                </td>
                <td className="table-cell text-right font-mono">
                  <span
                    className={
                      isCheapest ? 'text-brand-700 font-semibold' : 'text-gray-700'
                    }
                  >
                    {per100g != null
                      ? formatPrice(per100g, activeCurrency)
                      : '—'}
                  </span>
                </td>
                <td className="table-cell text-center">
                  <span
                    className={
                      v.availability === 'in_stock'
                        ? 'badge-green'
                        : v.availability === 'out_of_stock'
                        ? 'badge-red'
                        : 'badge-gray'
                    }
                  >
                    {v.availability === 'in_stock'
                      ? 'In Stock'
                      : v.availability === 'out_of_stock'
                      ? 'OOS'
                      : '—'}
                  </span>
                </td>
                <td className="table-cell text-gray-500 font-mono text-xs">
                  {v.sku ?? '—'}
                </td>
                <td className="table-cell">
                  <span
                    className={
                      v.priceType === 'calculated' ? 'badge-yellow' : 'badge-gray'
                    }
                  >
                    {v.priceType === 'calculated' ? 'Calc.' : 'Actual'}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
