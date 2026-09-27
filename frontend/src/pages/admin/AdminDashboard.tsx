import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldAlert,
  Database,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { getDataHealth, getRecentCrawls } from '../../lib/api';
import type { DataHealthRow, CrawlJob } from '../../types';

function LoginForm() {
  const { login, loginError } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-24">
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <ShieldAlert className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-gray-900">Admin Login</h2>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input-field w-full"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="input-field w-full"
              autoComplete="current-password"
            />
          </div>
          {loginError && (
            <p className="text-sm text-red-600">{loginError}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: DataHealthRow['lastCrawlStatus'] }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    case 'partial':
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'never':
      return <span className="text-gray-300 text-sm">—</span>;
  }
}

export default function AdminDashboard() {
  const { isAuthenticated, isLoading: authLoading, user, logout } =
    useAdminAuth();

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['data-health'],
    queryFn: getDataHealth,
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const { data: recentCrawls } = useQuery({
    queryKey: ['recent-crawls'],
    queryFn: getRecentCrawls,
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-5 h-5 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-brand-600" />
          <h1 className="text-xl font-semibold text-gray-900">
            Admin Dashboard
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{user?.email}</span>
          <button onClick={logout} className="btn-secondary text-xs py-1.5">
            Sign Out
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/admin/crawl', label: 'Crawl Control', icon: Activity },
          { to: '/admin/matches', label: 'Match Management', icon: Database },
        ].map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            className="card p-4 hover:border-brand-300 hover:shadow-sm transition-all flex items-center gap-3 group"
          >
            <Icon className="w-5 h-5 text-brand-600" />
            <span className="text-sm font-medium text-gray-700 group-hover:text-brand-700">
              {label}
            </span>
          </Link>
        ))}
      </div>

      {/* Data Health Table */}
      <div>
        <h2 className="section-header">Data Health</h2>
        <div className="card overflow-hidden">
          {healthLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 bg-gray-100 rounded animate-pulse"
                />
              ))}
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    'Supplier',
                    'Products',
                    'Variants',
                    'Last Crawl',
                    'Status',
                    'Stale',
                    'Errors',
                  ].map((h) => (
                    <th
                      key={h}
                      className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {health?.map((row: DataHealthRow) => (
                  <tr key={row.supplier} className="hover:bg-gray-50">
                    <td className="table-cell font-semibold text-gray-900">
                      {row.supplier}
                    </td>
                    <td className="table-cell font-mono">
                      {row.productCount.toLocaleString()}
                    </td>
                    <td className="table-cell font-mono">
                      {row.variantCount.toLocaleString()}
                    </td>
                    <td className="table-cell text-gray-500 font-mono text-xs">
                      {row.lastCrawlAt
                        ? new Date(row.lastCrawlAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={row.lastCrawlStatus} />
                        <span className="text-xs capitalize">
                          {row.lastCrawlStatus}
                        </span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span
                        className={
                          row.staleCount > 0 ? 'badge-yellow' : 'badge-green'
                        }
                      >
                        {row.staleCount}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span
                        className={
                          row.errorCount > 0 ? 'badge-red' : 'badge-gray'
                        }
                      >
                        {row.errorCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent Crawl Runs */}
      {recentCrawls && recentCrawls.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-header mb-0">Recent Crawl Runs</h2>
            <Link to="/admin/crawl" className="text-xs text-brand-600 hover:text-brand-800">
              Manage →
            </Link>
          </div>
          <div className="card overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Supplier', 'Status', 'Products', 'Started', 'Completed'].map(
                    (h) => (
                      <th
                        key={h}
                        className="table-cell text-left font-semibold text-gray-500 text-xs uppercase tracking-wide"
                      >
                        {h}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentCrawls.slice(0, 10).map((job: CrawlJob) => (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="table-cell font-semibold text-gray-900">
                      {job.supplier}
                    </td>
                    <td className="table-cell">
                      <span
                        className={
                          job.status === 'completed'
                            ? 'badge-green'
                            : job.status === 'failed'
                            ? 'badge-red'
                            : job.status === 'running'
                            ? 'badge-brand'
                            : 'badge-gray'
                        }
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="table-cell font-mono text-gray-700">
                      {job.productsProcessed}
                      {job.estimatedTotal ? ` / ${job.estimatedTotal}` : ''}
                    </td>
                    <td className="table-cell text-xs font-mono text-gray-500">
                      {job.startedAt
                        ? new Date(job.startedAt).toLocaleString()
                        : '—'}
                    </td>
                    <td className="table-cell text-xs font-mono text-gray-500">
                      {job.completedAt
                        ? new Date(job.completedAt).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
