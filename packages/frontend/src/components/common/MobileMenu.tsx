'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/AuthContext';

export default function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();

  const toggleMenu = () => setIsOpen(!isOpen);

  const menuItems = user?.role === 'Administrator' ? [
    { href: '/admin/users', label: 'User Management' },
    { href: '/admin/metrics', label: 'Metrics Dashboard' },
    { href: '/admin/audit', label: 'Audit Logs' },
    { href: '/admin/health', label: 'System Health' },
  ] : user?.role === 'DPO' ? [
    { href: '/admin/consent', label: 'Consent Management' },
    { href: '/admin/audit', label: 'Audit Logs' },
  ] : user?.role === 'Doctor' ? [
    { href: '/doctor/dashboard', label: 'Dashboard' },
  ] : user?.role === 'Nurse' ? [
    { href: '/nurse/dashboard', label: 'Dashboard' },
  ] : [
    { href: '/patient/dashboard', label: 'Dashboard' },
  ];

  return (
    <>
      {/* Hamburger Button */}
      <button
        onClick={toggleMenu}
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-blue-600 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label={isOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
      >
        {isOpen ? (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        )}
      </button>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={toggleMenu}
            role="presentation"
            aria-hidden="true"
          />
          <nav
            id="mobile-menu"
            className="fixed top-0 right-0 h-full w-64 bg-white shadow-lg z-50 md:hidden transform transition-transform duration-300"
            role="navigation"
            aria-label="Mobile navigation"
          >
            <div className="p-6">
              <div className="mb-6">
                <p className="text-sm text-gray-600">Logged in as</p>
                <p className="font-semibold">{user?.email}</p>
                <p className="text-xs text-gray-500">{user?.role}</p>
              </div>

              <nav className="space-y-2" role="menu">
                {menuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={toggleMenu}
                    className="block px-4 py-2 text-gray-700 hover:bg-blue-50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    role="menuitem"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <button
                onClick={() => {
                  logout();
                  toggleMenu();
                }}
                className="mt-6 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                aria-label="Logout from application"
              >
                Logout
              </button>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
