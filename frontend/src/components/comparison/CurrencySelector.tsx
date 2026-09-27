import React from 'react';
import { ALL_SUPPORTED_CURRENCIES, CURRENCY_INFO, useCurrency } from '../../context/CurrencyContext';
import type { CurrencyCode } from '../../types';

interface CurrencySelectorProps {
  value?: CurrencyCode;
  onChange?: (c: CurrencyCode) => void;
  className?: string;
  showLabel?: boolean;
}

export default function CurrencySelector({
  value,
  onChange,
  className = '',
  showLabel = false,
}: CurrencySelectorProps) {
  const { selectedDisplayCurrency, setDisplayCurrency } = useCurrency();

  const currentCurrency = value ?? selectedDisplayCurrency;
  const handleChange = (newCode: CurrencyCode) => {
    if (onChange) {
      onChange(newCode);
    }
    setDisplayCurrency(newCode);
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      {showLabel && (
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          Currency:
        </span>
      )}
      <select
        value={currentCurrency}
        onChange={(e) => handleChange(e.target.value as CurrencyCode)}
        className={`input-field pr-7 text-xs font-semibold bg-white border border-gray-300 rounded shadow-sm hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer ${className}`}
        aria-label="Display currency"
      >
        {ALL_SUPPORTED_CURRENCIES.map((code) => {
          const info = CURRENCY_INFO[code];
          return (
            <option key={code} value={code}>
              {info ? `${info.symbol} ${code}` : code}
            </option>
          );
        })}
      </select>
    </div>
  );
}
