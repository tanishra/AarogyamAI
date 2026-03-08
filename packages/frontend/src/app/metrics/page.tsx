'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MetricsAPI } from '@/lib/api/services/metrics';
import ConsultationMetrics from '@/components/metrics/ConsultationMetrics';
import ActiveUserMetrics from '@/components/metrics/ActiveUserMetrics';
import AIAcceptanceChart from '@/components/metrics/AIAcceptanceChart';
import PreparationTimeChart from '@/components/metrics/PreparationTimeChart';
import QuestionnaireCompletionChart from '@/components/metrics/QuestionnaireCompletionChart';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { AuthGuard } from '@/lib/auth/AuthGuard';
import { RoleGuard } from '@/lib/auth/RoleGuard';
import { Navigation } from '@/components/Navigation';
import { AppShell, PageHeader, AnimatedButton } from '@/components/common';

type TimePeriod = 'daily' | 'weekly' | 'monthly';

function MetricsPage() {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('daily');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const { data: summary, isLoading, error, refetch } = useQuery({
    queryKey: ['metrics', 'dashboard-summary'],
    queryFn: () => MetricsAPI.getDashboardSummary(),
    refetchInterval: autoRefresh ? 60000 : false,
    staleTime: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="ui-surface border-red-200 bg-red-50 p-5">
          <h3 className="font-semibold text-red-800">Error Loading Metrics</h3>
          <p className="mt-2 text-sm text-red-700">
            {error instanceof Error ? error.message : 'Failed to load metrics data'}
          </p>
          <AnimatedButton onClick={() => refetch()} className="mt-4">Retry</AnimatedButton>
        </div>
      </AppShell>
    );
  }

  return (
    <>
      <Navigation />
      <AppShell>
        <div className="mb-6 flex flex-col gap-4 overflow-hidden rounded-[22px] border border-blue-300/45 bg-gradient-to-r from-blue-700 via-indigo-700 to-cyan-600 px-6 py-6 text-white shadow-2xl shadow-indigo-900/30 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="ui-chip border-white/30 bg-white/10 text-blue-100">Analytics Workspace</p>
            <h1 className="mt-3 text-3xl font-bold">Metrics Dashboard</h1>
            <p className="mt-1 text-sm text-blue-100/90">Operational analytics with live refresh and role-wise adoption insights</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={timePeriod}
              onChange={(e) => setTimePeriod(e.target.value as TimePeriod)}
              className="ui-focus-ring h-11 rounded-xl border border-white/35 bg-white/15 px-3 text-sm text-white"
            >
              <option value="daily" className="text-slate-900">Daily</option>
              <option value="weekly" className="text-slate-900">Weekly</option>
              <option value="monthly" className="text-slate-900">Monthly</option>
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-3 py-2 text-sm text-white">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="h-4 w-4"
              />
              Auto refresh
            </label>
            <AnimatedButton variant="secondary" onClick={() => refetch()}>Refresh</AnimatedButton>
          </div>
        </div>

        {summary?.lastUpdated ? (
          <p className="mb-4 rounded-xl border border-indigo-200/70 bg-gradient-to-r from-indigo-50 to-cyan-50 px-3 py-2 text-xs text-slate-600">
            Last updated: {new Date(summary.lastUpdated).toLocaleString()}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="ui-surface border-indigo-200/80 bg-gradient-to-br from-indigo-50 to-white p-4"><ConsultationMetrics data={summary?.consultations} period={timePeriod} /></div>
          <div className="ui-surface border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-white p-4"><ActiveUserMetrics data={summary?.activeUsers} /></div>
          <div className="ui-surface border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-4"><AIAcceptanceChart data={summary?.aiAcceptance} period={timePeriod} /></div>
          <div className="ui-surface border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-4"><PreparationTimeChart data={summary?.preparationTime as never} period={timePeriod} /></div>
          <div className="ui-surface border-violet-200/80 bg-gradient-to-br from-violet-50 to-white p-4 lg:col-span-2"><QuestionnaireCompletionChart data={summary?.questionnaireCompletion} /></div>
        </div>
      </AppShell>
    </>
  );
}

export default function MetricsPageWithAuth() {
  return (
    <AuthGuard>
      <RoleGuard allowedRoles={['Administrator']}>
        <MetricsPage />
      </RoleGuard>
    </AuthGuard>
  );
}
