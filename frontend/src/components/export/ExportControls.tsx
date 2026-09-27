import React, { useState, useCallback } from 'react';
import { Download, FileSpreadsheet, Loader2, CheckCircle2 } from 'lucide-react';
import { requestExport, getExportJob } from '../../lib/api';
import type { ExportType, ExportJob } from '../../types';

interface ExportControlsProps {
  materialId?: string;
  className?: string;
}

type ButtonState = 'idle' | 'loading' | 'polling' | 'ready' | 'error';

const EXPORT_BUTTONS: { type: ExportType; label: string; description: string }[] = [
  {
    type: 'common_materials',
    label: 'Common Materials',
    description: 'All matched materials across suppliers',
  },
  {
    type: 'comparison',
    label: 'Current Comparison',
    description: 'Active comparison with all variants',
  },
  {
    type: 'variants',
    label: 'All Variants',
    description: 'Every size / SKU for all materials',
  },
  {
    type: 'price_history',
    label: 'Price History',
    description: 'Historical pricing data (CSV-friendly)',
  },
  {
    type: 'complete_workbook',
    label: 'Complete Workbook',
    description: 'All sheets in one .xlsx file',
  },
];

// Using Partial<Record<…>> + string literal cast to avoid TS narrowing issues
// with generic state setters
type StateMap = Partial<Record<ExportType, ButtonState>>;
type JobMap = Partial<Record<ExportType, ExportJob>>;
type ErrorMap = Partial<Record<ExportType, string>>;

export default function ExportControls({
  materialId,
  className = '',
}: ExportControlsProps) {
  const [states, setStates] = useState<StateMap>({});
  const [jobs, setJobs] = useState<JobMap>({});
  const [errors, setErrors] = useState<ErrorMap>({});

  function setStateFor(type: ExportType, val: ButtonState) {
    setStates((prev) => ({ ...prev, [type]: val }));
  }
  function setJobFor(type: ExportType, val: ExportJob) {
    setJobs((prev) => ({ ...prev, [type]: val }));
  }
  function setErrorFor(type: ExportType, val: string | undefined) {
    setErrors((prev) => {
      const next = { ...prev };
      if (val === undefined) {
        delete next[type];
      } else {
        next[type] = val;
      }
      return next;
    });
  }

  async function handleExport(type: ExportType) {
    setStateFor(type, 'loading');
    setErrorFor(type, undefined);

    try {
      const job = await requestExport(type, materialId ? { materialId } : {});
      setJobFor(type, job);

      if (job.downloadUrl) {
        setStateFor(type, 'ready');
        return;
      }

      // Poll for completion
      setStateFor(type, 'polling');
      let attempts = 0;
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const updated = await getExportJob(job.id);
          setJobFor(type, updated);
          if (updated.status === 'ready' && updated.downloadUrl) {
            clearInterval(pollInterval);
            setStateFor(type, 'ready');
          } else if (updated.status === 'failed' || attempts > 30) {
            clearInterval(pollInterval);
            setStateFor(type, 'error');
            setErrorFor(type, 'Export failed. Please try again.');
          }
        } catch {
          clearInterval(pollInterval);
          setStateFor(type, 'error');
          setErrorFor(type, 'Network error while checking export status.');
        }
      }, 2000);
    } catch (err) {
      setStateFor(type, 'error');
      setErrorFor(
        type,
        err instanceof Error ? err.message : 'Export request failed.'
      );
    }
  }

  return (
    <div className={`card p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <FileSpreadsheet className="w-4 h-4 text-brand-600" />
        Export Data
      </h3>
      <div className="space-y-2">
        {EXPORT_BUTTONS.map(({ type, label, description }) => {
          const state = states[type] ?? 'idle';
          const job = jobs[type] ?? null;
          const error = errors[type] ?? null;

          return (
            <div key={type} className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">{label}</p>
                <p className="text-xs text-gray-400">{description}</p>
                {error && (
                  <p className="text-xs text-red-600 mt-0.5">{error}</p>
                )}
              </div>

              {(state === 'idle' || state === 'error') ? (
                <button
                  onClick={() => handleExport(type)}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 flex-shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
              ) : (state === 'loading' || state === 'polling') ? (
                <div className="flex items-center gap-1.5 text-xs text-gray-500 flex-shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                  {state === 'loading' ? 'Preparing…' : 'Generating…'}
                </div>
              ) : (
                // ready
                <a
                  href={job?.downloadUrl ?? '#'}
                  download
                  className="btn-primary flex items-center gap-1.5 text-xs py-1.5 flex-shrink-0"
                  onClick={() => setStateFor(type, 'idle')}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Download
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* CSV note */}
      <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-gray-100">
        All exports include headers. CSV variants available on request.
      </p>
    </div>
  );
}
