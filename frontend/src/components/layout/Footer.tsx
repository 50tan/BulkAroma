import React from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical } from 'lucide-react';

const SUPPLIER_LINKS = [
  { label: 'Perfumers Speciality House', href: 'https://psh.com.au' },
  { label: 'Fraterworks', href: 'https://fraterworks.com' },
  { label: 'Perfumers Apprentice', href: 'https://perfumersapprentice.com' },
];

const PLATFORM_LINKS = [
  { label: 'Common Materials', to: '/common-materials' },
  { label: 'Compare Prices', to: '/compare' },
  { label: 'Admin', to: '/admin' },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="bg-gray-900 text-gray-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 bg-brand-600 rounded flex items-center justify-center">
                <FlaskConical className="w-3.5 h-3.5 text-white" strokeWidth={2} />
              </div>
              <span className="text-white font-semibold text-sm">Bulkaroma</span>
            </div>
            <p className="text-xs leading-relaxed text-gray-500">
              Cross-supplier price intelligence for professional perfumers and
              fragrance buyers. Compare PSH, Fraterworks, and Perfumers
              Apprentice in one place.
            </p>
          </div>

          {/* Suppliers */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Tracked Suppliers
            </h4>
            <ul className="space-y-1.5">
              {SUPPLIER_LINKS.map(({ label, href }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs hover:text-gray-200 transition-colors"
                  >
                    {label} ↗
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Platform */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Platform
            </h4>
            <ul className="space-y-1.5">
              {PLATFORM_LINKS.map(({ label, to }) => (
                <li key={to}>
                  <Link
                    to={to}
                    className="text-xs hover:text-gray-200 transition-colors"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <p className="text-xs text-gray-600">
            © {year} Bulkaroma Price Intelligence. Prices sourced from supplier
            websites; verify before purchase.
          </p>
          <p className="text-xs text-gray-600">
            Not affiliated with PSH, Fraterworks, or Perfumers Apprentice.
          </p>
        </div>
      </div>
    </footer>
  );
}
