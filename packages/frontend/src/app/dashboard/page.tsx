'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { AuthGuard } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Navigation } from '@/components/Navigation';
import { AppShell } from '@/components/common';

function DashboardContent() {
  const { user, role } = useAuth();
  const { t } = useI18n();

  const adminCards = [
    { title: t('admin.userManagement'), description: t('admin.cardUsersDesc'), href: '/admin/users', tag: t('admin.tagCore') },
    { title: t('admin.cardMetrics'), description: t('admin.cardMetricsDesc'), href: '/metrics', tag: t('admin.tagAnalytics') },
    { title: t('admin.cardAudit'), description: t('admin.cardAuditDesc'), href: '/audit', tag: t('admin.tagCompliance') },
    { title: t('admin.cardConsent'), description: t('admin.cardConsentDesc'), href: '/admin/consent', tag: t('admin.tagDpo') },
  ];

  const dpoCards = [
    { title: t('admin.cardDpo'), description: t('admin.cardDpoDesc'), href: '/dpo', tag: t('admin.tagPrimary') },
    { title: t('admin.cardAudit'), description: t('admin.cardAuditDescDpo'), href: '/audit', tag: t('admin.tagSecurity') },
    { title: t('admin.cardConsent'), description: t('admin.cardConsentDescDpo'), href: '/admin/consent', tag: t('admin.tagLegal') },
  ];

  const cards = role === 'Administrator' ? adminCards : dpoCards;

  return (
    <>
      <Navigation />
            <AppShell>
        <div className="mb-6 overflow-hidden rounded-[22px] border border-blue-300/50 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-600 px-6 py-6 text-white shadow-2xl shadow-blue-900/30">
          <p className="ui-chip border-white/30 bg-white/10 text-cyan-100">{t('admin.controlCenter')}</p>
          <h1 className="mt-3 text-3xl font-bold">{t('admin.welcome', { name: user?.name || t('admin.userFallback') })}</h1>
          <p className="mt-1 text-sm text-cyan-100/90">{t('admin.welcomeDesc')}</p>
          <p className="mt-3 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
            {role || t('common.role')}
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
              <p className="mt-4 text-sm font-semibold text-blue-600">{t('admin.openWorkspace')}</p>
            </Link>
          ))}
        </div>

        <div className="ui-surface mt-6 border-cyan-200/70 bg-gradient-to-r from-cyan-50 to-blue-50 p-5">
          <h2 className="text-base font-semibold text-slate-900">{t('admin.opSnapshot')}</h2>
          <p className="mt-2 text-sm text-slate-600">
            {t('admin.opSnapshotDesc')}
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
