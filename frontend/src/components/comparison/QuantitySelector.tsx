import React from 'react';
import type { QuantityUnit } from '../../types';

interface QuantitySelectorProps {
  quantity: number;
  unit: QuantityUnit;
  onQuantityChange: (qty: number) => void;
  onUnitChange: (u: QuantityUnit) => void;
}

const PRESETS: { label: string; qty: number; unit: QuantityUnit }[] = [
  { label: '10g', qty: 10, unit: 'g' },
  { label: '25g', qty: 25, unit: 'g' },
  { label: '50g', qty: 50, unit: 'g' },
  { label: '100g', qty: 100, unit: 'g' },
  { label: '250g', qty: 250, unit: 'g' },
  { label: '500g', qty: 500, unit: 'g' },
  { label: '1 kg', qty: 1, unit: 'kg' },
];

const UNITS: QuantityUnit[] = ['g', 'kg', 'ml', 'L', 'oz'];

export default function QuantitySelector({
  quantity,
  unit,
  onQuantityChange,
  onUnitChange,
}: QuantitySelectorProps) {
  const isCustom = !PRESETS.some((p) => p.qty === quantity && p.unit === unit);

  return (
    <div className="flex flex-col gap-2">
      {/* Input row */}
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0.001}
          step="any"
          value={quantity}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (!isNaN(v) && v > 0) onQuantityChange(v);
          }}
          className="input-field w-28 font-mono"
          aria-label="Target quantity"
        />
        <select
          value={unit}
          onChange={(e) => onUnitChange(e.target.value as QuantityUnit)}
          className="input-field pr-8"
          aria-label="Unit"
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </div>

      {/* Preset buttons */}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => {
          const active = p.qty === quantity && p.unit === unit;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => {
                onQuantityChange(p.qty);
                onUnitChange(p.unit);
              }}
              className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                active
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {p.label}
            </button>
          );
        })}
        {isCustom && (
          <span className="px-2.5 py-1 rounded border text-xs font-medium bg-brand-50 text-brand-700 border-brand-200">
            Custom
          </span>
        )}
      </div>
    </div>
  );
}
