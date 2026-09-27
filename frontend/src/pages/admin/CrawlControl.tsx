import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronLeft,
  Terminal,
} from 'lucide-react';
import { useAdminAuth } from '../../hooks/useAdminAuth';
import { triggerCrawl, getCrawlStatus, getRecentCrawls } from '../../lib/api';
import type { CrawlJob, SupplierCode } from '../../types';

type SupplierTarget = SupplierCode | 'all';

const TARGETS: { label: string; value: SupplierTarget; desc: string }[] = [
  {
    label: 'Crawl All',
    value: 'all',
    desc: 'PSH + Fraterworks + PA simultaneously',
  },
  {
    label: 'PSH',
    value: 'PSH',
    desc: 'Perfumers Speciality House (Australia)',
  },
  {
    label: 'Fraterworks',
    value: 'Fraterworks',
    desc: 'Fraterworks (New Zealand)',
  },
  { label: 'PA', value: 'PA', desc: 'Perfumers Apprentice (USA)' },
];

function jobStatusIcon(status: CrawlJob['status']) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />;
    case 'running':
      return (
        <Loader2 className="w-4 h-4 text-brand-600 animate-spin flex-shrink-0" />
      );
    default:
      return (
        <AlertTriangle className="w-4 h-4 text-gray-400 flex-shrink-0" />
      );
  }
}

function ProgressBar({
  processed,
  total,
}: {
  processed: number;
  total: number | null;
}) {
  if (!total) return null;
  const pct = Math.min(100, Math.round((processed / total) * 100));
  return (
    <div className="mt-1.5">
      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
        <span>{processed} products</span>
        <span>{pct}%</span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function CrawlControl() {
  const { isAuthenticated } = useAdminAuth();
  const [activeJobs, setActiveJobs] = useState<
    Record<SupplierTarget, CrawlJob | null>
  >({} as Record<SupplierTarget, CrawlJob | null>);
  const [loading, setLoading] = useState<SupplierTarget | null>(null);
  const [recentJobs, setRecentJobs] = useState<CrawlJob[]>([]);
  const [errorLogs, setErrorLogs] = useState<Record<SupplierTarget, string[]>>(
    {} as Record<SupplierTarget, string[]>
  );
  const pollingRefs = useRef<Record<string, ReturnType<typeof setInterval>>>(
    {}
  );

  useEffect(() => {
    getRecentCrawls().then(setRecentJobs).catch(() => {});
    return () => {
      Object.values(pollingRefs.current).forEach(clearInterval);
    };
  }, []);

  if (!isAuthenticated) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-600 mb-4">Please log in to access crawl control.</p>
        <Link to="/admin" className="btn-primary">
          Admin Login
        </Link>
      </div>
    );
  }

  async function handleCrawl(target: SupplierTarget) {
    setLoading(target);
    try {
      const job = await triggerCrawl(target);
      setActiveJobs((prev) => ({ ...prev, [target]: job }));
      startPolling(target, job.id);
    } catch (err) {
      setErrorLogs((prev) => ({
        ...prev,
        [target]: [
          ...(prev[target] ?? []),
          err instanceof Error ? err.message : 'Failed to start crawl',
        ],
      }));
    } finally {
      setLoading(null);
    }
  }

  function startPolling(target: SupplierTarget, jobId: string) {
    if (pollingRefs.current[jobId]) clearInterval(pollingRefs.current[jobId]);

    const interval = setInterval(async () => {
      try {
        const updated = await getCrawlStatus(jobId);
        setActiveJobs((prev) => ({ ...prev, [target]: updated }));

        if (updated.errors.length > 0) {
          setErrorLogs((prev) => ({
            ...prev,
            [target]: [...(prev[target] ?? []), ...updated.errors],
          }));
        }

        if (
          updated.status === 'completed' ||
          updated.status === 'failed'
        ) {
          clearInterval(pollingRefs.current[jobId]);
          delete pollingRefs.current[jobId];
          // Refresh recent jobs
          getRecentCrawls().then(setRecentJobs).catch(() => {});
        }
      } catch {
        clearInterval(pollingRefs.current[jobId]);
        delete pollingRefs.current[jobId];
      }
    }, 5000);

    pollingRefs.current[jobId] = interval;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/admin" className="btn-ghost flex items-center gap-1 text-xs">
          <ChevronLeft className="w-4 h-4" />
          Admin
        </Link>
        <h1 className="text-xl font-semibold text-gray-900">Crawl Control</h1>
      </div>

      {/* Trigger Cards */}
      <div>
        <h2 className="section-header">Trigger Crawl</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TARGETS.map(({ label, value, desc }) => {
            const job = activeJobs[value];
            const isRunning = job?.status === 'running' || job?.status === 'queued';
            const isDisabled = loading !== null || isRunning;

            return (
              <div
                key={value}
                className={`card p-4 flex flex-col gap-3 ${
                  isRunning ? 'border-brand-300 bg-brand-50' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {label}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                </div>

                {/* Job status */}
                {job && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      {jobStatusIcon(job.status)}
                      <span className="capitalize text-gray-600">
                        {job.status}
                      </span>
                      {job.productsFound > 0 && (
                        <span className="text-gray-500">
                          · {job.productsFound} found
                        </span>
                      )}
                    </div>
                    {isRunning && (
                      <ProgressBar
                        processed={job.productsProcessed}
                        total={job.estimatedTotal}
                      />
                    )}
                    {job.status === 'completed' && (
                      <p className="text-xs text-green-700">
                        ✓ {job.productsProcessed} products processed
                      </p>
                    )}
                  </div>
                )}

                <button
                  onClick={() => handleCrawl(value)}
                  disabled={isDisabled}
                  className="btn-primary flex items-center justify-center gap-2 mt-auto"
                >
                  {loading === value ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isRunning ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {isRunning ? 'Running…' : 'Start'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Logs */}
      {Object.entries(errorLogs).some(([, errs]) => errs.length > 0) && (
        <div>
          <h2 className="section-header flex items-center gap-2">
            <Terminal className="w-4 h-4" />
            Error Log
          </h2>
          {Object.entries(errorLogs).map(([target, errs]) =>
            errs.length > 0 ? (
              <div key={target} className="card overflow-hidden mb-3">
                <div className="px-3 py-2 bg-gray-900 text-gray-400 text-xs font-mono flex items-center justify-between">
                  <span>{target}</span>
                  <span>{errs.length} error(s)</span>
                </div>
                <div className="bg-gray-950 px-3 py-2 max-h-40 overflow-y-auto">
                  {errs.map((e, i) => (
                    <p
                      key={i}
                      className="text-xs text-red-400 font-mono leading-relaxed"
                    >
                      {e}
                    </p>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Recent Jobs */}
      {recentJobs.length > 0 && (
        <div>
          <h2 className="section-header">Recent Jobs</h2>
          <div className="card overflow-hidden">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {[
                    'Supplier',
                    'Status',
                    'Products',
                    'Errors',
                    'Started',
                    'Duration',
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
                {recentJobs.map((job) => {
                  const duration =
                    job.startedAt && job.completedAt
                      ? Math.round(
                          (new Date(job.completedAt).getTime() -
                            new Date(job.startedAt).getTime()) /
                            1000
                        )
                      : null;
                  return (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="table-cell font-semibold text-gray-900">
                        {job.supplier}
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-1.5">
                          {jobStatusIcon(job.status)}
                          <span className="capitalize text-xs">{job.status}</span>
                        </div>
                      </td>
                      <td className="table-cell font-mono text-gray-700">
                        {job.productsProcessed}
                        {job.estimatedTotal ? ` / ~${job.estimatedTotal}` : ''}
                      </td>
                      <td className="table-cell">
                        <span
                          className={
                            job.errors.length > 0 ? 'badge-red' : 'badge-gray'
                          }
                        >
                          {job.errors.length}
                        </span>
                      </td>
                      <td className="table-cell text-xs font-mono text-gray-500">
                        {job.startedAt
                          ? new Date(job.startedAt).toLocaleString()
                          : '—'}
                      </td>
                      <td className="table-cell text-xs text-gray-500">
                        {duration != null ? `${duration}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
