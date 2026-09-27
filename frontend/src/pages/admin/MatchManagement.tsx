import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  Filter,
} from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { getMatches, verifyMatch, rejectMatch } from '../../lib/api';
import type { MatchRecord } from '../../lib/api';

type MatchStatus = 'auto' | 'verified' | 'rejected';

const STATUS_TABS: { value: MatchStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'auto', label: 'Auto (needs review)' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
];

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls =
    pct >= 90 ? 'badge-green' : pct >= 70 ? 'badge-yellow' : 'badge-red';
  return <span className={cls}>{pct}%</span>;
}

export default function MatchManagement() {
  const { isAuthenticated } = useAdminAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<MatchStatus | 'all'>('auto');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['matches', statusFilter, page],
    queryFn: () =>
      getMatches(
        statusFilter === 'all' ? undefined : statusFilter,
        page
      ),
    enabled: isAuthenticated,
  });

  const verifyMutation = useMutation({
    mutationFn: verifyMatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: rejectMatch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-600 mb-4">Please log in to manage matches.</p>
        <Link to="/admin" className="btn-primary">
          Admin Login
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin" className="btn-ghost flex items-center gap-1 text-xs">
          <ChevronLeft className="w-4 h-4" />
          Admin
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Match Management</h1>
      </div>

      <p className="text-sm text-gray-500">
        Review and approve/reject automatically generated product matches. High-confidence
        matches ({'>'}90%) are applied automatically. Lower-confidence matches need
        manual review.
      </p>

      {/* Status Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {STATUS_TABS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => {
              setStatusFilter(value);
              setPage(1);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              statusFilter === value
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />
            ))}
          </div>
        ) : !data?.data.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            No matches found for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    'Material',
                    'Supplier',
                    'Supplier Product Name',
                    'Confidence',
                    'CAS',
                    'Name %',
                    'Status',
                    'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.data.map((m: MatchRecord) => {
                  const isVerifying = verifyMutation.isPending && verifyMutation.variables === m.id;
                  const isRejecting = rejectMutation.isPending && rejectMutation.variables === m.id;

                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="table-cell">
                        <Link
                          to={`/compare?q=${encodeURIComponent(m.materialName)}`}
                          className="font-medium text-gray-900 hover:text-brand-700 transition-colors"
                        >
                          {m.materialName}
                        </Link>
                      </td>
                      <td className="table-cell font-semibold text-gray-700">
                        {m.supplier}
                      </td>
                      <td className="table-cell text-gray-600 max-w-[200px] truncate italic text-xs">
                        {m.supplierProductName}
                      </td>
                      <td className="table-cell">
                        <ConfidenceBadge score={m.confidence} />
                      </td>
                      <td className="table-cell text-center">
                        {m.casMatch === true ? (
                          <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto" />
                        ) : m.casMatch === false ? (
                          <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="table-cell font-mono text-xs text-gray-600">
                        {m.nameScore != null
                          ? `${Math.round(m.nameScore * 100)}%`
                          : '—'}
                      </td>
                      <td className="table-cell">
                        <span
                          className={
                            m.status === 'verified'
                              ? 'badge-green'
                              : m.status === 'rejected'
                              ? 'badge-red'
                              : 'badge-yellow'
                          }
                        >
                          {m.status}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-2">
                          {m.status !== 'verified' && (
                            <button
                              onClick={() => verifyMutation.mutate(m.id)}
                              disabled={isVerifying || isRejecting}
                              className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900 font-medium disabled:opacity-50"
                              title="Verify this match"
                            >
                              {isVerifying ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              Verify
                            </button>
                          )}
                          {m.status !== 'rejected' && (
                            <button
                              onClick={() => rejectMutation.mutate(m.id)}
                              disabled={isVerifying || isRejecting}
                              className="flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50"
                              title="Reject this match"
                            >
                              {isRejecting ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <XCircle className="w-3.5 h-3.5" />
                              )}
                              Reject
                            </button>
                          )}
                        </div>
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
        <div className="flex items-center justify-between text-sm text-gray-600">
          <p className="text-xs text-gray-400">
            Page {page} of {data.totalPages} · {data.total} matches
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              onClick={() =>
                setPage((p) => Math.min(data.totalPages, p + 1))
              }
              disabled={page === data.totalPages}
              className="btn-secondary text-xs py-1.5 px-3 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
