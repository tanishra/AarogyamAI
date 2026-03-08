'use client';

import { useEffect, useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { AppShell, PageHeader, StatTile, AnimatedButton } from '@/components/common';

interface HealthStatus {
  apiConnected: boolean;
  lastSuccessfulRequest: string;
  avgResponseTime: number;
  consecutiveFailures: number;
  version: string;
  deployedAt: string;
}

export default function SystemHealthPage() {
  const [health, setHealth] = useState<HealthStatus>({
    apiConnected: true,
    lastSuccessfulRequest: new Date().toISOString(),
    avgResponseTime: 0,
    consecutiveFailures: 0,
    version: '1.0.0',
    deployedAt: new Date().toISOString(),
  });

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
            <p className="ui-chip border-white/30 bg-white/10 text-lime-100">Infra Monitor</p>
            <h1 className="mt-3 text-3xl font-bold">System Health</h1>
            <p className="mt-1 text-sm text-lime-100/90">Live infrastructure and API status</p>
          </div>
          <AnimatedButton variant="secondary" onClick={() => window.location.reload()}>
            Refresh
          </AnimatedButton>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatTile label="API Status" value={health.apiConnected ? 'Connected' : 'Disconnected'} trend="Live connection" tone={health.apiConnected ? 'success' : 'danger'} />
          <StatTile label="Response Time" value={`${health.avgResponseTime}ms`} trend="Recent average" tone={health.avgResponseTime > 5000 ? 'warning' : 'default'} />
          <StatTile label="Consecutive Failures" value={health.consecutiveFailures} trend="Rolling counter" tone={health.consecutiveFailures > 0 ? 'warning' : 'default'} />
          <StatTile label="Version" value={health.version} trend={process.env.NODE_ENV === 'production' ? 'Production' : 'Development'} />
        </div>

        {unhealthy ? (
          <div className="ui-surface mb-5 border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
            Connectivity warning: check backend service, Redis, and environment configuration.
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="ui-surface p-5">
            <h3 className="text-base font-semibold text-slate-900">Runtime Details</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Last successful request</dt><dd className="font-medium text-slate-900">{new Date(health.lastSuccessfulRequest).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Deployment time</dt><dd className="font-medium text-slate-900">{new Date(health.deployedAt).toLocaleString()}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Uptime (approx)</dt><dd className="font-medium text-slate-900">{Math.floor((Date.now() - new Date(health.deployedAt).getTime()) / (1000 * 60 * 60))}h</dd></div>
            </dl>
          </div>

          <div className="ui-surface p-5">
            <h3 className="text-base font-semibold text-slate-900">Quick Actions</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <AnimatedButton onClick={() => window.location.reload()}>Reload Page</AnimatedButton>
              <AnimatedButton
                variant="secondary"
                onClick={() => {
                  localStorage.clear();
                  window.location.href = '/login';
                }}
              >
                Clear Cache & Logout
              </AnimatedButton>
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}
