'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { AppShell, StatTile, AnimatedButton } from '@/components/common';
import { useI18n } from '@/lib/i18n';

interface HealthStatus {
  apiConnected: boolean;
  lastSuccessfulRequest: string;
  avgResponseTime: number;
  consecutiveFailures: number;
  version: string;
  deployedAt: string;
  // Timestamp of the last health check; used instead of Date.now() during
  // render so the component stays pure.
  checkedAt: number;
}

export default function SystemHealthPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [health, setHealth] = useState<HealthStatus>(() => ({
    apiConnected: true,
    lastSuccessfulRequest: new Date().toISOString(),
    avgResponseTime: 0,
    consecutiveFailures: 0,
    version: '1.0.0',
    deployedAt: new Date().toISOString(),
    checkedAt: Date.now(),
  }));

  useEffect(() => {
    const checkHealth = async () => {
      const start = Date.now();
      try {
        const response = await fetch('/api/health', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
        const responseTime = Date.now() - start;

        if (response.ok) {
          const data = await response.json();
          setHealth((prev) => ({
            ...prev,
            apiConnected: true,
            avgResponseTime: responseTime,
            consecutiveFailures: 0,
            lastSuccessfulRequest: new Date().toISOString(),
            version: data.version || prev.version,
            deployedAt: data.deployedAt || prev.deployedAt,
            checkedAt: Date.now(),
          }));
          return;
        }
      } catch {
        // handled below
      }

      setHealth((prev) => ({
        ...prev,
        apiConnected: false,
        consecutiveFailures: prev.consecutiveFailures + 1,
        checkedAt: Date.now(),
      }));
    };

    void checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const unhealthy = !health.apiConnected || health.consecutiveFailures >= 3;

  return (
    <>
      <Navigation />
      <AppShell>
        <div className="mb-6 flex flex-col gap-4 overflow-hidden rounded-[22px] border border-lime-300/45 bg-gradient-to-r from-emerald-700 via-lime-600 to-teal-600 px-6 py-6 text-white shadow-2xl shadow-emerald-900/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="ui-chip border-white/30 bg-white/10 text-lime-100">{t('admin.infraMonitor')}</p>
            <h1 className="mt-3 text-3xl font-bold">{t('admin.systemHealth')}</h1>
            <p className="mt-1 text-sm text-lime-100/90">{t('admin.healthDesc')}</p>
          </div>
          <AnimatedButton variant="secondary" onClick={() => window.location.reload()}>
            {t('common.refresh')}
          </AnimatedButton>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatTile label={t('admin.apiStatus')} value={health.apiConnected ? t('admin.connected') : t('admin.disconnected')} trend={t('admin.liveConnection')} tone={health.apiConnected ? 'success' : 'danger'} />
          <StatTile label={t('admin.responseTime')} value={`${health.avgResponseTime}ms`} trend={t('admin.recentAverage')} tone={health.avgResponseTime > 5000 ? 'warning' : 'default'} />
          <StatTile label={t('admin.consecFailures')} value={health.consecutiveFailures} trend={t('admin.rollingCounter')} tone={health.consecutiveFailures > 0 ? 'warning' : 'default'} />
          <StatTile label={t('admin.version')} value={health.version} trend={process.env.NODE_ENV === 'production' ? t('admin.production') : t('admin.development')} />
        </div>

        {unhealthy ? (
          <div className="ui-surface mb-5 border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            {t('admin.connectivityWarn')}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="ui-surface p-5">
            <h3 className="text-base font-semibold text-slate-900">{t('admin.runtimeDetails')}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">{t('admin.lastSuccessReq')}</dt><dd className="font-medium text-slate-900">{new Date(health.lastSuccessfulRequest).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t('admin.deployTime')}</dt><dd className="font-medium text-slate-900">{new Date(health.deployedAt).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">{t('admin.uptime')}</dt><dd className="font-medium text-slate-900">{Math.floor((health.checkedAt - new Date(health.deployedAt).getTime()) / (1000 * 60 * 60))}h</dd></div>
            </dl>
          </div>

          <div className="ui-surface p-5">
            <h3 className="text-base font-semibold text-slate-900">{t('admin.quickActions')}</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <AnimatedButton onClick={() => window.location.reload()}>{t('admin.reloadPage')}</AnimatedButton>
              <AnimatedButton
                variant="secondary"
                onClick={() => {
                  localStorage.clear();
                  router.push('/login');
                }}
              >
                {t('admin.clearCacheLogout')}
              </AnimatedButton>
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}
