import React from 'react';
import { RefreshCw, Clock } from 'lucide-react';

interface DataFreshnessProps {
  checkedAt: string | null; // ISO datetime string
  isLive?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

function formatRelative(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export default function DataFreshness({
  checkedAt,
  isLive = false,
  onRefresh,
  isRefreshing = false,
  className = '',
}: DataFreshnessProps) {
  return (
    <div className={`flex items-center gap-2 text-xs text-gray-500 ${className}`}>
      <Clock className="w-3.5 h-3.5 flex-shrink-0" />
      {checkedAt ? (
        <span>
          {isLive ? (
            <span className="text-green-600 font-medium mr-1">Live ·</span>
          ) : (
            <span className="mr-1">Cached ·</span>
          )}
          Checked {formatRelative(checkedAt)}
        </span>
      ) : (
        <span>No data yet</span>
      )}
      {onRefresh && (
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="ml-1 flex items-center gap-1 text-brand-600 hover:text-brand-800 disabled:opacity-50 transition-colors"
          title="Refresh prices"
        >
          <RefreshCw
            className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`}
          />
          <span>Refresh</span>
        </button>
      )}
    </div>
  );
}
