'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'next/navigation';
import { RoleGuard, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AnimatedButton, AppShell, EmptyState, PageHeader, Skeleton } from '@/components/common';
import { VitalsEntryForm, VitalsData } from '@/components/nurse/VitalsEntryForm';
import { CriticalAlertBanner } from '@/components/nurse/CriticalAlertBanner';
import { VitalsHistoryDisplay } from '@/components/nurse/VitalsHistoryDisplay';

interface SummaryData {
  patient?: { id: string; name: string; email: string };
  summary?: {
    chiefComplaint?: string;
    symptoms?: string[];
    medicalHistory?: string[];
    allergies?: string[];
  };
}

function NurseVitalsEntryContent() {
  const { token, logout } = useAuth();
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const params = useParams<{ patientId: string }>();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId');
  const patientId = params.patientId;

  // Fetch patient summary
  const { data, isLoading } = useQuery({
    queryKey: ['nurse-patient-summary', patientId, sessionId],
    enabled: !!token && !!patientId && !!sessionId,
    queryFn: async () => {
      const response = await fetch(`/api/nurse/patient/${patientId}/summary?sessionId=${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load patient summary');
      const payload = await response.json();
      return payload?.data as SummaryData;
    },
  });

  // Fetch active alerts
  const { data: alertsData, refetch: refetchAlerts } = useQuery({
    queryKey: ['active-alerts'],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch('/api/nurse/alerts/active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load alerts');
      const payload = await response.json();
      return payload?.data || [];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch vitals history
  const { data: vitalsHistory, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['vitals-history', patientId],
    enabled: !!token && !!patientId,
    queryFn: async () => {
      const response = await fetch(`/api/nurse/patient/${patientId}/vitals-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load vitals history');
      const payload = await response.json();
      return payload?.data || [];
    },
  });

  // Submit vitals mutation
  const submitVitalsMutation = useMutation({
    mutationFn: async (vitals: VitalsData) => {
      const response = await fetch(`/api/nurse/patient/${patientId}/vitals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientId,
          sessionId,
          ...vitals,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to submit vitals');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vitals-history', patientId] });
      queryClient.invalidateQueries({ queryKey: ['active-alerts'] });
    },
  });

  // Acknowledge alert mutation
  const acknowledgeAlertMutation = useMutation({
    mutationFn: async (alertId: string) => {
      const response = await fetch(`/api/nurse/alerts/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: '' }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to acknowledge alert');
      }

      return response.json();
    },
    onSuccess: () => {
      refetchAlerts();
    },
  });

  // Mark ready mutation
  const markReadyMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/nurse/patient/${patientId}/ready`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to mark patient ready');
      }

      return response.json();
    },
  });

  if (!sessionId) {
    return (
      <AppShell tone="nurse">
        <EmptyState
          title={t('history.missingSession')}
          description={t('history.missingSessionDescNurse')}
        />
      </AppShell>
    );
  }

  const previousVitals = vitalsHistory && vitalsHistory.length > 0 ? vitalsHistory[0] : null;

  return (
    <AppShell tone="nurse">
      <PageHeader
        title={t('vitals.title')}
        subtitle={t('vitals.pageSubtitle')}
        badge={t('dash.nurseFallback')}
        actions={
          <div className="flex items-center gap-2">
            <Link href="/nurse/dashboard">
              <AnimatedButton variant="secondary">{t('common.backToDashboard')}</AnimatedButton>
            </Link>
            <AnimatedButton variant="secondary" onClick={logout}>{t('nav.logout')}</AnimatedButton>
          </div>
        }
      />

      {/* Critical Alerts Banner */}
      {alertsData && alertsData.length > 0 && (
        <div className="mb-5 animate-fade-up">
          <CriticalAlertBanner
            alerts={alertsData}
            onAcknowledge={(alertId) => acknowledgeAlertMutation.mutateAsync(alertId)}
          />
        </div>
      )}

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-cyan-200/70 bg-gradient-to-r from-[#e9f6ff] via-[#f4fbff] to-[#e8fffb] p-5 animate-fade-up">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-cyan-200/45 blur-3xl" />
        <h2 className="text-lg font-semibold text-slate-900">{t('vitals.heroTitle')}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {t('vitals.heroDesc')}
        </p>
      </section>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Patient Context */}
          <section className="lg:col-span-4 ui-surface ui-surface-hover p-5 animate-fade-up">
            <h2 className="text-lg font-bold text-slate-900">{t('history.patientContext')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('history.patientContextDesc')}</p>

            <div className="mt-4 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs text-slate-500">{t('queue.patient')}</p>
                <p className="text-sm font-semibold text-slate-900">{data?.patient?.name || t('queue.patient')}</p>
                <p className="text-xs text-slate-500">{data?.patient?.email || ''}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('queue.complaint')}</p>
                <p className="mt-1 text-sm text-slate-800">{data?.summary?.chiefComplaint || t('common.notCaptured')}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.symptoms')}</p>
                <p className="mt-1 text-sm text-slate-800">{data?.summary?.symptoms?.join(', ') || t('common.notCaptured')}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t('common.allergies')}</p>
                <p className="mt-1 text-sm text-amber-800">{data?.summary?.allergies?.join(', ') || t('common.noAllergies')}</p>
              </div>
            </div>

            {/* Vitals History */}
            <div className="mt-5">
              <VitalsHistoryDisplay vitals={vitalsHistory || []} isLoading={isLoadingHistory} />
            </div>
          </section>

          {/* Vitals Form */}
          <section className="lg:col-span-8 ui-surface ui-surface-hover p-5 animate-fade-up delay-1">
            <h2 className="text-lg font-bold text-slate-900">{t('vitals.title')}</h2>
            <p className="mt-1 text-sm text-slate-500 mb-4">{t('vitals.enterHint')}</p>

            <VitalsEntryForm
              patientId={patientId}
              sessionId={sessionId}
              onSubmit={(vitals) => submitVitalsMutation.mutateAsync(vitals)}
              isSubmitting={submitVitalsMutation.isPending}
              previousVitals={previousVitals}
            />

            {submitVitalsMutation.isSuccess && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {t('vitals.saved')}
              </div>
            )}

            {submitVitalsMutation.error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {(submitVitalsMutation.error as Error).message}
              </div>
            )}

            {/* Mark Ready Button */}
            <div className="mt-5 pt-5 border-t border-slate-200">
              <AnimatedButton
                onClick={() => markReadyMutation.mutate()}
                disabled={markReadyMutation.isPending}
                className="w-full"
              >
                {markReadyMutation.isPending ? t('vitals.markingReady') : t('vitals.markReadyPatient')}
              </AnimatedButton>

              {markReadyMutation.error && (
                <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {(markReadyMutation.error as Error).message}
                </p>
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}

export default function NurseVitalsEntryPage() {
  return (
    <RoleGuard allowedRoles={['Nurse', 'Administrator']}>
      <NurseVitalsEntryContent />
    </RoleGuard>
  );
}
