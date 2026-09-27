import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Menu, X, FlaskConical } from 'lucide-react';
import CurrencySelector from '../comparison/CurrencySelector';

const NAV_LINKS = [
  { to: '/', label: 'Home' },
  { to: '/common-materials', label: 'Common Materials' },
  { to: '/compare', label: 'Compare' },
  { to: '/admin', label: 'Admin' },
];

export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 bg-brand-600 rounded flex items-center justify-center flex-shrink-0">
              <FlaskConical className="w-4 h-4 text-white" strokeWidth={2} />
            </div>
            <div className="leading-tight">
              <span className="text-gray-900 font-semibold text-sm tracking-tight">
                Bulkaroma
              </span>
              <span className="block text-xs text-gray-400 font-normal leading-none">
                Price Intelligence
              </span>
            </div>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-4">
            <nav className="flex items-center gap-1">
              {NAV_LINKS.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
            <div className="h-5 w-px bg-gray-200" />
            <CurrencySelector showLabel className="py-1 px-2.5 text-xs" />
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded text-gray-500 hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 pb-3 pt-2 space-y-2">
          <div className="py-2 border-b border-gray-100">
            <CurrencySelector showLabel className="w-full text-sm" />
          </div>
          {NAV_LINKS.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setMobileOpen(false)}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </header>
  );
}
