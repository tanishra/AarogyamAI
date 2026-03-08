'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppShell, PageHeader, AnimatedButton, StatTile } from '@/components/common';
import { Navigation } from '@/components/Navigation';

interface MetricsSummary {
  consultations: {
    total: number;
    daily: Array<{ date: string; value: number }>;
    byDoctor: Record<string, number>;
  };
  activeUsers: {
    byRole: Record<string, number>;
    totalRegistered: Record<string, number>;
  };
  aiAcceptance: {
    overallRate: number;
    warningThreshold: boolean;
  };
  preparationTime: {
    average: number;
  };
  questionnaireCompletion: {
    rate: number;
    warningThreshold: boolean;
  };
  lastUpdated: string;
}

export default function MetricsDashboardPage() {
  const [timeRange, setTimeRange] = useState<'daily' | 'weekly' | 'monthly'>('daily');

  const { data: metrics, isLoading, refetch } = useQuery({
    queryKey: ['metrics-dashboard', timeRange],
    queryFn: async () => {
      const response = await fetch('/api/metrics/dashboard-summary', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch metrics');
      const result = await response.json();
      return result.data as MetricsSummary;
    },
    refetchInterval: 60000,
  });

  const onlineCount = useMemo(
    () => Object.values(metrics?.activeUsers.byRole || {}).reduce((acc, value) => acc + value, 0),
    [metrics]
  );

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-96 items-center justify-center">
          <div className="text-center">
            <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="mt-4 text-sm text-slate-600">Loading metrics...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <>
      <Navigation />
      <AppShell>
        <div className="mb-6 flex flex-col gap-4 overflow-hidden rounded-[22px] border border-emerald-300/45 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 px-6 py-6 text-white shadow-2xl shadow-emerald-900/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="ui-chip border-white/30 bg-white/10 text-emerald-100">Analytics</p>
            <h1 className="mt-3 text-3xl font-bold">Admin Metrics</h1>
            <p className="mt-1 text-sm text-emerald-100/90">
              Last updated: {metrics ? new Date(metrics.lastUpdated).toLocaleString() : 'N/A'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value as 'daily' | 'weekly' | 'monthly')}
              className="ui-focus-ring h-11 rounded-xl border border-white/35 bg-white/15 px-3 text-sm text-white"
            >
              <option value="daily" className="text-slate-900">Daily</option>
              <option value="weekly" className="text-slate-900">Weekly</option>
              <option value="monthly" className="text-slate-900">Monthly</option>
            </select>
            <AnimatedButton variant="secondary" onClick={() => refetch()}>Refresh</AnimatedButton>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Consultations" value={metrics?.consultations.total || 0} trend="Total tracked" />
          <StatTile label="Users Online" value={onlineCount} trend="Current active sessions" />
          <StatTile
            label="AI Acceptance"
            value={`${metrics?.aiAcceptance.overallRate || 0}%`}
            trend={metrics?.aiAcceptance.warningThreshold ? 'Below threshold' : 'Healthy'}
            tone={metrics?.aiAcceptance.warningThreshold ? 'warning' : 'success'}
          />
          <StatTile label="Prep Time" value={`${metrics?.preparationTime.average || 0} min`} trend="Avg per consult" />
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="ui-surface p-5">
            <h3 className="text-base font-semibold text-slate-900">Active Users by Role</h3>
            <div className="mt-4 space-y-3">
              {Object.entries(metrics?.activeUsers.byRole || {}).map(([role, count]) => {
                const maxCount = Math.max(...Object.values(metrics?.activeUsers.byRole || { default: 1 }));
                const width = `${(count / maxCount) * 100}%`;

                return (
                  <div key={role}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-slate-600">{role}</span>
                      <span className="font-semibold text-slate-900">{count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-500" style={{ width }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="ui-surface p-5">
            <h3 className="text-base font-semibold text-slate-900">Questionnaire Completion</h3>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-24 w-24 items-center justify-center rounded-full border-8 border-slate-200 text-2xl font-bold text-slate-900">
                {metrics?.questionnaireCompletion.rate || 0}%
              </div>
              <div>
                <p className="text-sm text-slate-600">
                  {metrics?.questionnaireCompletion.warningThreshold
                    ? 'Completion below target, follow-up recommended.'
                    : 'Completion rate is healthy.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </>
  );
}
