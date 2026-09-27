import React from 'react';
import { CheckCircle2, XCircle, HelpCircle, ShieldCheck } from 'lucide-react';
import type { MatchEvidence } from '../../types';

interface MatchExplanationProps {
  evidence: MatchEvidence;
  confidence: number;
  supplierProductName: string;
  onReviewClick?: () => void;
}

function EvidenceRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 py-1.5">
      <span className="mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="ml-2 text-sm text-gray-500">{value}</span>
      </div>
    </div>
  );
}

export default function MatchExplanation({
  evidence,
  confidence,
  supplierProductName,
  onReviewClick,
}: MatchExplanationProps) {
  const pct = Math.round(confidence * 100);
  const confidenceColor =
    pct >= 90
      ? 'text-green-700 bg-green-50 border-green-200'
      : pct >= 70
      ? 'text-yellow-700 bg-yellow-50 border-yellow-200'
      : 'text-red-700 bg-red-50 border-red-200';

  function triIcon(val: boolean | null) {
    if (val === true) return <CheckCircle2 className="w-4 h-4 text-green-600" />;
    if (val === false) return <XCircle className="w-4 h-4 text-red-500" />;
    return <HelpCircle className="w-4 h-4 text-gray-400" />;
  }

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800">
          Why is this matched?
        </h4>
        <div className={`px-2.5 py-0.5 rounded-full border text-xs font-semibold ${confidenceColor}`}>
          {pct}% match
        </div>
      </div>

      <p className="text-xs text-gray-500 mb-3 italic">
        Supplier product: "{supplierProductName}"
      </p>

      <div className="divide-y divide-gray-100">
        <EvidenceRow
          icon={triIcon(evidence.casMatch)}
          label="CAS Number"
          value={
            evidence.casMatch === true
              ? 'Exact match'
              : evidence.casMatch === false
              ? 'No match'
              : 'Not available'
          }
        />
        <EvidenceRow
          icon={triIcon(
            evidence.nameMatchScore !== null
              ? evidence.nameMatchScore >= 0.8
              : null
          )}
          label="Name similarity"
          value={
            evidence.nameMatchScore !== null
              ? `${Math.round(evidence.nameMatchScore * 100)}%`
              : 'N/A'
          }
        />
        <EvidenceRow
          icon={triIcon(evidence.manufacturerMatch)}
          label="Manufacturer"
          value={
            evidence.manufacturerMatch === true
              ? 'Same manufacturer'
              : evidence.manufacturerMatch === false
              ? 'Different manufacturer'
              : 'Unknown'
          }
        />
        {evidence.manuallyVerified && (
          <div className="flex items-center gap-2 pt-2">
            <ShieldCheck className="w-4 h-4 text-brand-600" />
            <span className="text-sm text-brand-700 font-medium">
              Manually verified by editor
            </span>
          </div>
        )}
        {evidence.notes && (
          <div className="pt-2">
            <p className="text-xs text-gray-500 italic">{evidence.notes}</p>
          </div>
        )}
      </div>

      {onReviewClick && pct < 90 && !evidence.manuallyVerified && (
        <button
          onClick={onReviewClick}
          className="mt-3 btn-secondary text-xs py-1.5"
        >
          Flag for Review
        </button>
      )}
    </div>
  );
}
