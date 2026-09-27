import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { search } from '../../lib/api';
import type { SearchResult } from '../../types';

interface SearchBarProps {
  initialQuery?: string;
  compact?: boolean;
}

export default function SearchBar({
  initialQuery = '',
  compact = false,
}: SearchBarProps) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (!compact) {
      inputRef.current?.focus();
    }
  }, [compact]);

  // Debounced autocomplete
  const { data: suggestions, isFetching: suggestionsLoading } =
    useQuery({
      queryKey: ['search-suggestions', query],
      queryFn: () => search(query),
      enabled: query.trim().length >= 2 && !submitted,
      staleTime: 30_000,
    });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSubmitted(true);
    setShowSuggestions(false);
    navigate(`/compare?q=${encodeURIComponent(q)}`);
  }

  function handleSuggestionClick(result: SearchResult) {
    setQuery(result.name);
    setShowSuggestions(false);
    navigate(`/compare?q=${encodeURIComponent(result.name)}`);
  }

  return (
    <div className={compact ? '' : 'w-full max-w-2xl mx-auto'}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative">
          <Search
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            style={{ width: compact ? 16 : 20, height: compact ? 16 : 20 }}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSubmitted(false);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder="Search raw materials — Iso E Super, Linalool, CAS 78-70-6..."
            className={`w-full border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent
              ${compact
                ? 'pl-9 pr-24 py-2 text-sm'
                : 'pl-12 pr-32 py-3.5 text-base shadow-sm'
              }`}
            autoComplete="off"
          />
          <button
            type="submit"
            className={`absolute right-2 top-1/2 -translate-y-1/2 btn-primary
              ${compact ? 'py-1 px-3 text-xs' : 'py-2 px-4'}`}
          >
            {suggestionsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Compare'
            )}
          </button>
        </div>

        {/* Suggestions dropdown */}
        {showSuggestions && suggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden">
            {suggestions.slice(0, 8).map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={() => handleSuggestionClick(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors flex items-center justify-between group"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900">
                    {s.name}
                  </span>
                  {s.casNumber && (
                    <span className="ml-2 text-xs text-gray-400 font-mono">
                      CAS {s.casNumber}
                    </span>
                  )}
                  {s.category && (
                    <span className="ml-2 text-xs text-gray-400">
                      · {s.category}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400 group-hover:text-brand-600">
                  {s.supplierCount} supplier{s.supplierCount !== 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>

      {/* Quick links — only on hero variant */}
      {!compact && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-4 text-sm text-gray-500">
          <span className="text-xs uppercase tracking-wide font-medium text-gray-400">
            Quick:
          </span>
          {[
            { label: 'Common Materials', to: '/common-materials' },
            { label: 'Browse by Category', to: '/common-materials?sort=category' },
            { label: 'Compare Suppliers', to: '/compare' },
          ].map(({ label, to }) => (
            <button
              key={to}
              type="button"
              onClick={() => navigate(to)}
              className="text-brand-600 hover:text-brand-800 hover:underline transition-colors text-sm"
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
