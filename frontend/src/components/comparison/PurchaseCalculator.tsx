import React from 'react';
import { Package2, AlertCircle } from 'lucide-react';
import type { SupplierComparison, QuantityUnit, CurrencyCode } from '../../types';
import { UNIT_TO_GRAMS } from '../../types';
import { calcPurchase } from '../../hooks/usePurchaseCalculator';
import { useCurrency } from '../../context/CurrencyContext';

const SUPPLIER_LABELS: Record<string, string> = {
  PSH: 'Perfumer Supply House',
  Fraterworks: 'Fraterworks',
  PA: "The Perfumer's Apprentice",
};

interface PurchaseCalculatorProps {
  suppliers: SupplierComparison[];
  targetQuantity: number;
  targetUnit: QuantityUnit;
  displayCurrency?: CurrencyCode;
}

function fmtGrams(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(2)} kg`;
  return `${g.toFixed(g % 1 === 0 ? 0 : 1)} g`;
}

export default function PurchaseCalculator({
  suppliers,
  targetQuantity,
  targetUnit,
  displayCurrency,
}: PurchaseCalculatorProps) {
  const {
    selectedDisplayCurrency,
    formatPrice,
    formatOriginalPrice,
    convertPrice,
  } = useCurrency();

  const activeCurrency = displayCurrency ?? selectedDisplayCurrency;
  const targetGrams = targetQuantity * UNIT_TO_GRAMS[targetUnit];

  const rows = suppliers
    .filter((s) => s.bestVariant != null)
    .map((s) => {
      const v = s.bestVariant!;
      const purchase =
        s.purchase ??
        calcPurchase(
          targetQuantity,
          targetUnit,
          v.quantity,
          v.unit,
          v.listedPrice,
          v.currency
        );

      const convertedCost =
        s.purchase?.convertedActualCost ??
        convertPrice(purchase.actualCost, purchase.actualCostCurrency, activeCurrency);

      return { supplier: s.supplier, v, purchase, convertedCost };
    });

  if (rows.length === 0) {
    return (
      <div className="card p-6 text-center text-sm text-gray-500">
        No supplier data available for purchase calculation.
      </div>
    );
  }

  // Find cheapest total cost (in display currency)
  let cheapestIdx = -1;
  let cheapestConverted = Infinity;
  rows.forEach((r, i) => {
    const cost = r.convertedCost ?? r.purchase.actualCost;
    if (cost < cheapestConverted) {
      cheapestConverted = cost;
      cheapestIdx = i;
    }
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Package2 className="w-4 h-4 text-gray-500" />
        <p className="text-sm text-gray-600">
          Packages required to fill{' '}
          <span className="font-semibold text-gray-900">
            {targetQuantity}
            {targetUnit}
          </span>
          :
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {rows.map(({ supplier, v, purchase, convertedCost }, i) => {
          const isCheapest = i === cheapestIdx;
          return (
            <div
              key={supplier}
              className={`rounded-lg border p-4 ${
                isCheapest
                  ? 'border-brand-400 bg-brand-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-gray-500">
                  {supplier}
                </span>
                {isCheapest && (
                  <span className="badge-brand text-xs">Cheapest</span>
                )}
              </div>
              <p className="text-xs text-gray-500 mb-2 truncate">
                {SUPPLIER_LABELS[supplier] || supplier}
              </p>

              {/* Main calc */}
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Packages:</span>
                  <span className="font-semibold font-mono text-gray-900">
                    {purchase.packagesRequired} × {v.quantity}{v.unit}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Purchased:</span>
                  <span className="font-mono text-gray-700">
                    {fmtGrams(purchase.actualQuantityPurchased)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Excess:</span>
                  <span
                    className={`font-mono ${
                      purchase.excessQuantity > 0
                        ? 'text-yellow-700'
                        : 'text-green-700'
                    }`}
                  >
                    {purchase.excessQuantity === 0
                      ? 'None'
                      : fmtGrams(purchase.excessQuantity)}
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wide">
                  Actual Purchase Cost
                </p>
                <p className="text-base font-medium font-mono text-gray-700">
                  {formatOriginalPrice(purchase.actualCost, purchase.actualCostCurrency)}
                </p>
                {convertedCost != null && (
                  <p className="text-lg font-bold text-brand-700 font-mono mt-0.5">
                    ≈ {formatPrice(convertedCost, activeCurrency)}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  * Actual purchase cost for whole packages
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {targetGrams > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-gray-400 mt-1">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          Calculations assume you buy whole packages. Excess material is yours
          to keep. Shipping and taxes are not included.
        </p>
      )}
    </div>
  );
}
