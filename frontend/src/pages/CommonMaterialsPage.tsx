import React, { useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { getMaterials, getCoverageStats } from '../lib/api';
import type {
  CoverageFilter,
  MaterialFilters,
  MaterialSortField,
  SortDirection,
  SupplierCode,
} from '../types';
import DataFreshness from '../components/common/DataFreshness';
import Breadcrumb from '../components/common/Breadcrumb';

const CATEGORIES = [
  'Aromatic Chemicals',
  'Musks',
  'Aldehydes',
  'Naturals',
  'Fixatives',
  'Citrus',
  'Florals',
  'Woods',
  'Animalic',
  'Gourmand',
];

const SUPPLIERS: SupplierCode[] = ['PSH', 'Fraterworks', 'PA'];

const SORT_FIELDS: { value: MaterialSortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'supplierCount', label: 'Supplier Count' },
  { value: 'updatedAt', label: 'Last Updated' },
];

const PAGE_SIZE = 50;

function SortIcon({
  field,
  current,
  dir,
}: {
  field: MaterialSortField;
  current: MaterialSortField;
  dir: SortDirection;
}) {
  if (field !== current)
    return <ArrowUpDown className="w-3.5 h-3.5 text-gray-300" />;
  return dir === 'asc' ? (
    <ArrowUp className="w-3.5 h-3.5 text-brand-600" />
  ) : (
    <ArrowDown className="w-3.5 h-3.5 text-brand-600" />
  );
}

export default function CommonMaterialsPage() {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [hasCas, setHasCas] = useState<boolean | undefined>(undefined);
  const [suppliers, setSuppliers] = useState<SupplierCode[]>([]);
  const [coverage, setCoverage] = useState<CoverageFilter>(
    (searchParams.get('coverage') as CoverageFilter) || 'all'
  );
  const [sort, setSort] = useState<MaterialSortField>(
    (searchParams.get('sort') as MaterialSortField) ?? 'name'
  );
  const [dir, setDir] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery({
    queryKey: ['coverageStats'],
    queryFn: getCoverageStats,
    staleTime: 5 * 60 * 1000,
  });

  const filters: MaterialFilters = {
    ...(search ? { search } : {}),
    ...(category ? { category } : {}),
    ...(hasCas !== undefined ? { hasCas } : {}),
    ...(suppliers.length ? { suppliers } : {}),
    ...(coverage && coverage !== 'all' ? { coverage } : {}),
  };

  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ['materials', page, filters, sort, dir],
    queryFn: () => getMaterials(page, PAGE_SIZE, filters, sort, dir),
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  function handleSort(field: MaterialSortField) {
    if (field === sort) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(field);
      setDir('asc');
    }
    setPage(1);
  }

  function toggleSupplier(s: SupplierCode) {
    setSuppliers((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
    setPage(1);
  }

  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <Breadcrumb
        crumbs={[
          { label: 'Home', to: '/' },
          { label: 'Common Materials' },
        ]}
      />

      <div className="mt-4 mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Catalog & Cross-Supplier Materials Directory
          </h1>
          <p className="text-sm text-gray-500 mt-1 flex flex-wrap items-center gap-2">
            <span className="font-medium text-gray-900">
              {data ? `${data.total.toLocaleString()} materials shown` : 'Loading…'}
            </span>
            <span className="text-gray-300">·</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {stats ? `${stats.all3} All 3 Suppliers` : '71 All 3'}
            </span>
            <span className="text-gray-300">·</span>
            <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium bg-blue-50 px-2 py-0.5 rounded text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
              {stats ? `${stats.any2} Common across ≥2` : '354 across ≥2'}
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500 text-xs">
              {stats ? `${stats.total.toLocaleString()} total materials` : '1,884 total'}
            </span>
          </p>
        </div>
        {dataUpdatedAt && (
          <DataFreshness
            checkedAt={new Date(dataUpdatedAt).toISOString()}
            className="self-start sm:self-auto"
          />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] gap-6">
        {/* ── Filters Sidebar ── */}
        <aside className="space-y-5">
          {/* Supplier Coverage Tier */}
          <div>
            <p className="section-header">Supplier Coverage</p>
            <div className="space-y-1">
              {[
                { value: 'all' as const, label: 'All Catalog Materials', count: stats?.total },
                { value: 'all_3' as const, label: 'All 3 Suppliers', count: stats?.all3 },
                { value: 'any_2' as const, label: 'Any 2+ Suppliers', count: stats?.any2 },
                { value: 'psh_fraterworks' as const, label: 'PSH + Fraterworks', count: stats?.pshFraterworks },
                { value: 'psh_pa' as const, label: 'PSH + PA', count: stats?.pshPa },
                { value: 'fraterworks_pa' as const, label: 'Fraterworks + PA', count: stats?.fraterworksPa },
                { value: 'psh_only' as const, label: 'PSH Only', count: stats?.pshOnly },
                { value: 'fraterworks_only' as const, label: 'Fraterworks Only', count: stats?.fraterworksOnly },
                { value: 'pa_only' as const, label: 'PA Only', count: stats?.paOnly },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setCoverage(opt.value);
                    setPage(1);
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors text-left ${
                    coverage === opt.value
                      ? 'bg-brand-600 text-white font-medium shadow-sm'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ml-1.5 ${
                        coverage === opt.value
                          ? 'bg-white/20 text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {opt.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Search */}
          <div>
            <p className="section-header">Search</p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Filter materials…"
                className="input-field w-full pl-8 text-xs"
              />
            </div>
          </div>

          {/* Category */}
          <div>
            <p className="section-header">Category</p>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="input-field w-full text-xs"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Suppliers */}
          <div>
            <p className="section-header">Supplier Availability</p>
            <div className="space-y-1.5">
              {SUPPLIERS.map((s) => (
                <label
                  key={s}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={suppliers.includes(s)}
                    onChange={() => toggleSupplier(s)}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">{s}</span>
                </label>
              ))}
            </div>
          </div>

          {/* CAS */}
          <div>
            <p className="section-header">CAS Number</p>
            <div className="space-y-1.5">
              {[
                { label: 'Any', value: undefined },
                { label: 'Has CAS', value: true },
                { label: 'No CAS', value: false },
              ].map(({ label, value }) => (
                <label
                  key={label}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="cas"
                    checked={hasCas === value}
                    onChange={() => {
                      setHasCas(value);
                      setPage(1);
                    }}
                    className="border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-sm text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Sort */}
          <div>
            <p className="section-header">Sort By</p>
            <div className="space-y-1">
              {SORT_FIELDS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleSort(value)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs transition-colors ${
                    sort === value
                      ? 'bg-brand-50 text-brand-700 font-medium'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {label}
                  <SortIcon field={value} current={sort} dir={dir} />
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Table ── */}
        <div className="min-w-0">
          <div className="card overflow-hidden">
            {isLoading ? (
              <div className="p-8 text-center">
                <div className="space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-10 bg-gray-100 rounded animate-pulse"
                    />
                  ))}
                </div>
              </div>
            ) : data?.data.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                No materials match your filters.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {[
                        { field: 'name' as const, label: 'Material Name' },
                        { field: 'category' as const, label: 'Category' },
                      ].map(({ field, label }) => (
                        <th
                          key={field}
                          onClick={() => handleSort(field)}
                          className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide cursor-pointer select-none hover:text-gray-700"
                        >
                          <div className="flex items-center gap-1">
                            {label}
                            <SortIcon field={field} current={sort} dir={dir} />
                          </div>
                        </th>
                      ))}
                      <th className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        CAS
                      </th>
                      <th className="table-cell text-center font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        PSH
                      </th>
                      <th className="table-cell text-center font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        FW
                      </th>
                      <th className="table-cell text-center font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        PA
                      </th>
                      <th className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Coverage Tier
                      </th>
                      <th className="table-cell text-right font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Variants
                      </th>
                      <th className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide">
                        Updated
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data?.data.map((m) => {
                      const hasPSH = !!m.supplierNames.PSH;
                      const hasFW = !!m.supplierNames.Fraterworks;
                      const hasPA = !!m.supplierNames.PA;
                      return (
                        <tr
                          key={m.id}
                          className="hover:bg-gray-50 transition-colors"
                        >
                          <td className="table-cell">
                            <Link
                              to={`/compare?q=${encodeURIComponent(m.name)}`}
                              className="font-medium text-gray-900 hover:text-brand-700 transition-colors"
                            >
                              {m.name}
                            </Link>
                          </td>
                          <td className="table-cell text-gray-500 text-xs">
                            {m.category ?? '—'}
                          </td>
                          <td className="table-cell font-mono text-xs text-gray-500">
                            {m.casNumber ?? '—'}
                          </td>
                          {[hasPSH, hasFW, hasPA].map((has, i) => (
                            <td key={i} className="table-cell text-center">
                              <span
                                className={
                                  has
                                    ? 'text-green-600 text-base font-bold'
                                    : 'text-gray-300 text-base'
                                }
                              >
                                {has ? '✓' : '·'}
                              </span>
                            </td>
                          ))}
                          <td className="table-cell">
                            {hasPSH && hasFW && hasPA ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                All 3 Suppliers
                              </span>
                            ) : (hasPSH && hasFW) ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800">
                                PSH + FW (2)
                              </span>
                            ) : (hasPSH && hasPA) ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800">
                                PSH + PA (2)
                              </span>
                            ) : (hasFW && hasPA) ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-blue-100 text-blue-800">
                                FW + PA (2)
                              </span>
                            ) : hasPSH ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                                PSH Only
                              </span>
                            ) : hasFW ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                                FW Only
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
                                PA Only
                              </span>
                            )}
                          </td>
                          <td className="table-cell text-right font-mono text-gray-600">
                            {m.variantCount}
                          </td>
                          <td className="table-cell text-xs text-gray-400 font-mono">
                            {new Date(m.updatedAt).toLocaleDateString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <p className="text-xs text-gray-400">
                Page {page} of {totalPages} · {data.total} materials
              </p>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn-secondary p-1.5 disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const pg =
                    totalPages <= 5
                      ? i + 1
                      : page <= 3
                      ? i + 1
                      : page >= totalPages - 2
                      ? totalPages - 4 + i
                      : page - 2 + i;
                  return (
                    <button
                      key={pg}
                      onClick={() => setPage(pg)}
                      className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                        pg === page
                          ? 'bg-brand-600 text-white'
                          : 'btn-secondary p-0'
                      }`}
                    >
                      {pg}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn-secondary p-1.5 disabled:opacity-40"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
