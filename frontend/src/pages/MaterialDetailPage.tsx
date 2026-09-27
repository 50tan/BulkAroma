import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, AlertCircle, ExternalLink } from 'lucide-react';
import { getMaterial, getMaterialHistory } from '../lib/api';
import Breadcrumb from '../components/common/Breadcrumb';
import VariantTable from '../components/comparison/VariantTable';
import PriceHistoryChart from '../components/comparison/PriceHistoryChart';
import PurchaseCalculator from '../components/comparison/PurchaseCalculator';
import QuantitySelector from '../components/comparison/QuantitySelector';
import CurrencySelector from '../components/comparison/CurrencySelector';
import ExportControls from '../components/export/ExportControls';
import { useCurrency } from '../context/CurrencyContext';
import type { QuantityUnit, SupplierCode } from '../types';

const SUPPLIER_LABELS: Record<SupplierCode, string> = {
  PSH: 'Perfumer Supply House',
  Fraterworks: 'Fraterworks',
  PA: "The Perfumer's Apprentice",
};

export default function MaterialDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { selectedDisplayCurrency, setDisplayCurrency } = useCurrency();
  const [quantity, setQuantity] = useState(100);
  const [unit, setUnit] = useState<QuantityUnit>('g');
  const [historyDays, setHistoryDays] = useState(90);

  const { data: material, isLoading, isError } = useQuery({
    queryKey: ['material', id],
    queryFn: () => getMaterial(id!),
    enabled: !!id,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['material-history', id, historyDays],
    queryFn: () => getMaterialHistory(id!, historyDays),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 gap-3">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
        <span className="text-sm">Loading material…</span>
      </div>
    );
  }

  if (isError || !material) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="card p-6 flex items-start gap-3 border-red-200 bg-red-50">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">
              Material not found
            </p>
            <p className="text-sm text-red-600 mt-1">
              This material may have been removed or the ID is invalid.
            </p>
            <Link to="/common-materials" className="btn-secondary mt-3 inline-flex">
              ← Browse Materials
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <Breadcrumb
        crumbs={[
          { label: 'Home', to: '/' },
          { label: 'Common Materials', to: '/common-materials' },
          { label: material.name },
        ]}
      />

      {/* ── Material Header ── */}
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
              {material.name}
            </h1>
            {material.chemicalName && (
              <p className="text-sm text-gray-500 mt-0.5 italic">
                {material.chemicalName}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
              {material.casNumber && (
                <span className="font-mono text-gray-600">
                  CAS{' '}
                  <span className="font-semibold">{material.casNumber}</span>
                </span>
              )}
              {material.category && (
                <span className="badge-gray">{material.category}</span>
              )}
            </div>
            {material.description && (
              <p className="text-sm text-gray-500 mt-3 leading-relaxed max-w-2xl">
                {material.description}
              </p>
            )}
          </div>
          <Link
            to={`/compare?q=${encodeURIComponent(material.name)}`}
            className="btn-primary flex items-center gap-2 flex-shrink-0 self-start"
          >
            Compare Prices
          </Link>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end bg-white border border-gray-200 rounded-lg p-4">
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
      </div>

      {/* ── Supplier Availability ── */}
      <div>
        <h2 className="section-header">Supplier Availability</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {material.suppliersAvailable.map((s) => (
            <div key={s} className="card p-3 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">
                  {s}
                </p>
                <p className="text-sm text-gray-700">{SUPPLIER_LABELS[s] || s}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Price History ── */}
      <div>
        <h2 className="section-header">Price History</h2>
        <PriceHistoryChart history={history} displayCurrency={selectedDisplayCurrency} />
      </div>

      {/* ── Export ── */}
      <ExportControls materialId={material.id} className="mb-8" />
    </div>
  );
}
