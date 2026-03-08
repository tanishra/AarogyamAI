'use client';

import { Navigation } from '@/components/Navigation';
import { SessionManager } from '@/components/SessionManager';
import { AuthGuard } from '@/lib/auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { href: '/admin/users', label: 'User Management', icon: '👥' },
    { href: '/admin/metrics', label: 'Metrics Dashboard', icon: '📊' },
    { href: '/admin/audit', label: 'Audit Logs', icon: '📋' },
    { href: '/admin/consent', label: 'Consent & Grievance', icon: '📝' },
    { href: '/admin/health', label: 'System Health', icon: '💚' },
  ];

  return (
    <AuthGuard>
      <Navigation />
      <SessionManager />
      <div className="min-h-screen bg-gray-50">
        <div className="flex">
          {/* Sidebar */}
          <aside className="w-64 bg-white border-r border-gray-200 min-h-screen">
            <div className="p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-6">Admin Panel</h2>
              <nav className="space-y-2">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                      pathname === item.href
                        ? 'bg-indigo-50 text-indigo-600 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-xl">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 p-8">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
