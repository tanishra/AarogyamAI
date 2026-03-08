'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { AuthGuard } from '@/lib/auth';
import { Navigation } from '@/components/Navigation';
import { SessionManager } from '@/components/SessionManager';
import { AppShell, PageHeader } from '@/components/common';

function DashboardContent() {
  const { user, role } = useAuth();

  const adminCards = [
    { title: 'User Management', description: 'Manage roles, access states, and onboarding requests', href: '/admin/users', tag: 'Core' },
    { title: 'Metrics Dashboard', description: 'Monitor system performance and adoption trends', href: '/metrics', tag: 'Analytics' },
    { title: 'Audit Console', description: 'Trace access history and security-relevant actions', href: '/audit', tag: 'Compliance' },
    { title: 'Consent Ops', description: 'Review consent records and grievance pipelines', href: '/admin/consent', tag: 'DPO' },
  ];

  const dpoCards = [
    { title: 'DPO Hub', description: 'Consent, grievances, and data request governance', href: '/dpo', tag: 'Primary' },
    { title: 'Audit Console', description: 'Investigate access patterns and anomalies', href: '/audit', tag: 'Security' },
    { title: 'Consent Ops', description: 'Track withdrawals and patient rights workflows', href: '/admin/consent', tag: 'Legal' },
  ];

  const cards = role === 'Administrator' ? adminCards : dpoCards;

  return (
    <>
      <Navigation />
      <SessionManager />
      <AppShell>
        <div className="mb-6 overflow-hidden rounded-[22px] border border-blue-300/50 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 px-6 py-6 text-white shadow-2xl shadow-blue-900/30">
          <p className="ui-chip border-white/30 bg-white/10 text-cyan-100">Admin Control Center</p>
          <h1 className="mt-3 text-3xl font-bold">Welcome, {user?.name || 'User'}</h1>
          <p className="mt-1 text-sm text-cyan-100/90">Command center for administrative and compliance workflows</p>
          <p className="mt-3 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            {role || 'Role'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, idx) => (
            <Link
              key={card.title}
              href={card.href}
              className="ui-surface ui-surface-hover group relative overflow-hidden p-5 animate-fade-up"
              style={{ animationDelay: `${Math.min(idx * 80, 260)}ms` }}
            >
              <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-cyan-200/45 blur-2xl transition-transform duration-300 group-hover:scale-110" />
              <p className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {card.tag}
              </p>
              <h3 className="mt-3 text-lg font-bold text-slate-900 transition-colors group-hover:text-blue-700">{card.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{card.description}</p>
              <p className="mt-4 text-sm font-semibold text-blue-600">Open workspace</p>
            </Link>
          ))}
        </div>

        <div className="ui-surface mt-6 border-cyan-200/70 bg-gradient-to-r from-cyan-50 to-blue-50 p-5">
          <h2 className="text-base font-semibold text-slate-900">Operational Snapshot</h2>
          <p className="mt-2 text-sm text-slate-600">
            This panel now uses a modern bento-style surface system with smooth transitions and hover depth for faster visual scanning.
          </p>
        </div>
      </AppShell>
    </>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}
