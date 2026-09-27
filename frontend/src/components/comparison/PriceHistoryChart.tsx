import React, { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PriceHistoryPoint, CurrencyCode, SupplierCode } from '../../types';
import { useCurrency } from '../../context/CurrencyContext';

interface PriceHistoryChartProps {
  history: PriceHistoryPoint[];
  displayCurrency?: CurrencyCode;
}

const RANGE_DAYS: Record<string, number | null> = {
  '30D': 30,
  '90D': 90,
  '1Y': 365,
  All: null,
};

const SUPPLIER_COLORS: Record<SupplierCode, string> = {
  PSH: '#1e6d61',
  Fraterworks: '#2563eb',
  PA: '#d97706',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: '2-digit',
  });
}

export default function PriceHistoryChart({
  history,
  displayCurrency,
}: PriceHistoryChartProps) {
  const [range, setRange] = useState<string>('90D');
  const { selectedDisplayCurrency, formatPrice, convertPrice } = useCurrency();
  const activeCurrency = displayCurrency ?? selectedDisplayCurrency;

  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range];
    if (!days) return history;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return history.filter((p) => new Date(p.date).getTime() >= cutoff);
  }, [history, range]);

  // Pivot: date → { PSH, Fraterworks, PA }
  const chartData = useMemo(() => {
    const byDate: Record<string, Record<string, number>> = {};
    filtered.forEach((p) => {
      const day = p.date.slice(0, 10);
      if (!byDate[day]) byDate[day] = {};
      const converted =
        convertPrice(p.pricePerHundredGrams, p.currency, activeCurrency) ??
        p.pricePerHundredGrams;
      byDate[day][p.supplier] = Math.round(converted * 100) / 100;
    });
    return Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({ date, ...vals }));
  }, [filtered, activeCurrency, convertPrice]);

  const suppliers = Array.from(
    new Set(filtered.map((p) => p.supplier))
  ) as SupplierCode[];

  if (history.length === 0) {
    return (
      <div className="card p-8 text-center text-gray-400 text-sm">
        No price history available yet. History will appear after multiple crawl
        cycles.
      </div>
    );
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-800">
          Price History — per 100g ({activeCurrency})
        </h3>
        <div className="flex gap-1">
          {Object.keys(RANGE_DAYS).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                range === r
                  ? 'bg-brand-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {chartData.length < 2 ? (
        <div className="h-40 flex items-center justify-center text-sm text-gray-400">
          Not enough data points for the selected range.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => formatPrice(v, activeCurrency)}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip
              formatter={(value: number, name: string) => [
                formatPrice(value, activeCurrency),
                name,
              ]}
              labelFormatter={(label) => `Date: ${formatDate(label)}`}
              contentStyle={{
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid #e5e7eb',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12 }}
              iconType="circle"
              iconSize={8}
            />
            {suppliers.map((s) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                name={s}
                stroke={SUPPLIER_COLORS[s]}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
