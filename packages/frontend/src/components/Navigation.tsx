'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export function Navigation() {
  const { user, role, logout } = useAuth();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const adminMenuItems = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/admin/users', label: 'Users' },
    { href: '/metrics', label: 'Metrics' },
    { href: '/audit', label: 'Audit' },
    { href: '/admin/consent', label: 'Consent' },
  ];

  const dpoMenuItems = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/dpo', label: 'DPO Hub' },
    { href: '/audit', label: 'Audit' },
    { href: '/admin/consent', label: 'Consent' },
  ];

  const menuItems = role === 'Administrator' ? adminMenuItems : dpoMenuItems;

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-4">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-bold text-white shadow-md shadow-blue-500/30">
            CZ
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Clinical Zen Control</p>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{role || 'Access'}</p>
          </div>
          <div className="hidden items-center gap-1 md:flex">
            {menuItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? 'bg-blue-50 text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-900">{user?.name || 'User'}</p>
            <p className="text-xs text-slate-500">{role}</p>
          </div>
          <button
            onClick={() => void logout()}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm"
          >
            Logout
          </button>
        </div>

        <button
          onClick={() => setIsMobileMenuOpen((prev) => !prev)}
          className="inline-flex rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
        >
          <span className="sr-only">Toggle menu</span>
          {isMobileMenuOpen ? (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {isMobileMenuOpen ? (
        <div className="border-t border-slate-200 bg-white p-3 md:hidden">
          <div className="space-y-1">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                  pathname === item.href ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
          <button
            onClick={() => void logout()}
            className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            Logout
          </button>
        </div>
      ) : null}
    </nav>
  );
}
