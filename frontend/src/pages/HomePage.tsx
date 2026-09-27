import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Database,
  Package,
  Layers,
  CheckCircle2,
  Clock,
  ExternalLink,
  ArrowRight,
} from 'lucide-react';
import SearchBar from '../components/search/SearchBar';
import DataFreshness from '../components/common/DataFreshness';
import { getStats, getCommonMaterials } from '../lib/api';
import type { CommonMaterial } from '../types';

const SUPPLIER_INFO = [
  {
    code: 'PSH',
    name: 'Perfumers Speciality House',
    country: 'Australia',
    currency: 'AUD',
    url: 'https://psh.com.au',
    desc: 'Australian specialty raw material supplier with a curated catalog of aroma chemicals and naturals.',
  },
  {
    code: 'Fraterworks',
    name: 'Fraterworks',
    country: 'New Zealand',
    currency: 'NZD',
    url: 'https://fraterworks.com',
    desc: 'New Zealand-based supplier catering to indie perfumers, stocking IFF, Givaudan, and Symrise materials.',
  },
  {
    code: 'PA',
    name: 'Perfumers Apprentice',
    country: 'USA',
    currency: 'USD',
    url: 'https://perfumersapprentice.com',
    desc: 'US-based supplier with one of the widest SKU selections for hobbyists and professionals.',
  },
];

const STAT_CONFIGS = [
  { key: 'totalMaterials', label: 'Materials', icon: Database },
  { key: 'totalSupplierProducts', label: 'Supplier Products', icon: Package },
  { key: 'totalVariants', label: 'Size Variants', icon: Layers },
  { key: 'commonMaterials', label: 'Common (all 3)', icon: CheckCircle2 },
] as const;

export default function HomePage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: getStats,
    staleTime: 10 * 60 * 1000,
  });

  const { data: commonMaterials, isLoading: materialsLoading } = useQuery({
    queryKey: ['common-materials'],
    queryFn: getCommonMaterials,
    staleTime: 10 * 60 * 1000,
  });

  const topMaterials = commonMaterials?.slice(0, 12) ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* ── Hero ── */}
      <section className="py-14 border-b border-gray-200">
        <div className="max-w-3xl mx-auto text-center mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold text-gray-900 mb-2 tracking-tight">
            Raw Material Price Intelligence
          </h1>
          <p className="text-gray-500 text-base leading-relaxed">
            Compare aroma chemicals and fragrance ingredients across PSH,
            Fraterworks, and Perfumers Apprentice — with real purchase
            calculations.
          </p>
        </div>
        <SearchBar />
      </section>

      {/* ── Dataset Stats ── */}
      <section className="py-8 border-b border-gray-200">
        <h2 className="section-header">Dataset Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {STAT_CONFIGS.map(({ key, label, icon: Icon }) => {
            const value = stats?.[key];
            return (
              <div key={key} className="card p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-brand-600" />
                  <span className="text-xs text-gray-500 font-medium">
                    {label}
                  </span>
                </div>
                {statsLoading ? (
                  <div className="h-7 bg-gray-100 rounded animate-pulse w-16" />
                ) : (
                  <p className="text-2xl font-semibold font-mono text-gray-900">
                    {value?.toLocaleString() ?? '—'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
        {stats?.lastUpdatedAt && (
          <DataFreshness
            checkedAt={stats.lastUpdatedAt}
            className="mt-2"
          />
        )}
      </section>

      {/* ── Common Materials Grid ── */}
      <section className="py-8 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-header mb-0">
            Common Materials — Available from all 3 Suppliers
          </h2>
          <Link
            to="/common-materials"
            className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800 transition-colors"
          >
            View all <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {materialsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="card p-3 h-20 animate-pulse bg-gray-100" />
            ))}
          </div>
        ) : topMaterials.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {topMaterials.map((m: CommonMaterial) => (
              <Link
                key={m.id}
                to={`/compare?q=${encodeURIComponent(m.name)}`}
                className="card p-3 hover:border-brand-300 hover:shadow-sm transition-all group"
              >
                <p className="text-sm font-medium text-gray-900 group-hover:text-brand-700 leading-snug mb-1">
                  {m.name}
                </p>
                {m.casNumber && (
                  <p className="text-xs text-gray-400 font-mono mb-1">
                    CAS {m.casNumber}
                  </p>
                )}
                {m.category && (
                  <p className="text-xs text-gray-400">{m.category}</p>
                )}
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">
            No common materials found yet. Run the crawlers to populate data.
          </p>
        )}
      </section>

      {/* ── Supplier Cards ── */}
      <section className="py-8">
        <h2 className="section-header">Tracked Suppliers</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {SUPPLIER_INFO.map((s) => (
            <div key={s.code} className="card p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">
                    {s.code}
                  </span>
                  <h3 className="text-sm font-semibold text-gray-900 mt-0.5">
                    {s.name}
                  </h3>
                </div>
                <span className="badge-gray">{s.currency}</span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed mb-3">
                {s.desc}
              </p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>
                    {stats?.lastUpdatedAt
                      ? `Updated recently`
                      : 'No crawl data'}
                  </span>
                </div>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-800 transition-colors"
                >
                  Visit <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
