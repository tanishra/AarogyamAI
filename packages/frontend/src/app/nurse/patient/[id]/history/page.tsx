'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RoleGuard, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AnimatedButton, AppShell, EmptyState, PageHeader, Skeleton, StatTile } from '@/components/common';

interface NurseHistoryResponse {
  patient?: { id: string; name: string; email: string };
  summary?: {
    chief_complaint?: string;
    symptoms?: string[];
    medical_history?: string[];
    current_medications?: string[];
    allergies?: string[];
    updated_at?: string;
  } | null;
  recentSessions?: Array<{
    id: string;
    status: string;
    started_at: string;
    emergency_detected: boolean;
    duration_minutes?: number;
  }>;
}

interface VitalsHistoryItem {
  id: string;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  temperature_fahrenheit?: number;
  oxygen_saturation?: number;
  respiratory_rate?: number;
  flagged_abnormal?: boolean;
  recorded_at: string;
}

function NursePatientHistoryContent() {
  const { token, logout } = useAuth();
  const { t } = useI18n();
  const params = useParams<{ id: string }>();
  const patientId = params.id;

  const { data, isLoading } = useQuery({
    queryKey: ['nurse-patient-history', patientId],
    enabled: !!token && !!patientId,
    queryFn: async () => {
      const [historyRes, vitalsRes] = await Promise.all([
        fetch(`/api/nurse/patient/${patientId}/history`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/nurse/patient/${patientId}/vitals-history`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!historyRes.ok) throw new Error('Failed to load patient history');
      if (!vitalsRes.ok) throw new Error('Failed to load vitals history');

      const historyPayload = await historyRes.json();
      const vitalsPayload = await vitalsRes.json();

      return {
        history: (historyPayload?.data || {}) as NurseHistoryResponse,
        vitalsHistory: (vitalsPayload?.data || []) as VitalsHistoryItem[],
      };
    },
  });

  const history = data?.history;
  const vitalsHistory = useMemo<VitalsHistoryItem[]>(
    () => data?.vitalsHistory || [],
    [data?.vitalsHistory]
  );

  const abnormalCount = useMemo(
    () => vitalsHistory.filter((item) => Boolean(item.flagged_abnormal)).length,
    [vitalsHistory]
  );

  return (
    <AppShell tone="nurse">
      <PageHeader
        title={t('history.nurseTitle')}
        subtitle={t('history.nurseSubtitle')}
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

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-blue-200/70 bg-gradient-to-r from-[#eaf4ff] via-[#f4fbff] to-[#edfff8] p-5 animate-fade-up">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-blue-200/45 blur-3xl" />
        <h2 className="text-lg font-semibold text-slate-900">{t('history.nurseHero')}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {t('history.nurseHeroDesc')}
        </p>
      </section>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={t('history.recentSessions')} value={history?.recentSessions?.length || 0} trend={t('history.last10')} />
        <StatTile label={t('history.vitalsRecords')} value={vitalsHistory.length} trend={t('history.last20')} />
        <StatTile label={t('history.abnormalFlags')} value={abnormalCount} trend={t('history.needsAttention')} tone={abnormalCount > 0 ? 'warning' : 'default'} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !history?.patient ? (
        <EmptyState title={t('history.patientNotFound')} description={t('history.patientNotFoundDesc')} />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <section className="space-y-5 lg:col-span-5">
            <div className="ui-surface ui-surface-hover p-5 animate-fade-up">
              <h2 className="text-lg font-bold text-slate-900">{t('history.patientSummary')}</h2>
              <p className="mt-1 text-sm text-slate-500">{history.patient.name} • {history.patient.email}</p>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('queue.complaint')}</p>
                  <p className="mt-1 text-sm text-slate-800">{history.summary?.chief_complaint || t('common.notCaptured')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.symptoms')}</p>
                  <p className="mt-1 text-sm text-slate-800">{history.summary?.symptoms?.join(', ') || t('common.notCaptured')}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('common.allergies')}</p>
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {history.summary?.allergies?.join(', ') || t('common.noAllergies')}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('history.currentMeds')}</p>
                  <p className="mt-1 text-sm text-slate-800">{history.summary?.current_medications?.join(', ') || t('history.notListed')}</p>
                </div>
              </div>
            </div>

            <div className="ui-surface ui-surface-hover p-5 animate-fade-up delay-1">
              <h3 className="text-base font-semibold text-slate-900">{t('history.recentIntake')}</h3>
              <div className="mt-3 space-y-2">
                {(history.recentSessions || []).map((session) => (
                  <div
                    key={session.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition-transform hover:scale-[1.01]"
                  >
                    <p className="font-semibold text-slate-900">{new Date(session.started_at).toLocaleString()}</p>
                    <p className="text-xs text-slate-500">
                      {session.status}
                      {session.emergency_detected ? ` • ${t('queue.emergencyDetected')}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="ui-surface ui-surface-hover p-5 animate-fade-up delay-2 lg:col-span-7">
            <h2 className="text-lg font-bold text-slate-900">{t('history.vitalsHistory')}</h2>
            <p className="mt-1 text-sm text-slate-500">{t('history.trendDesc')}</p>

            {vitalsHistory.length === 0 ? (
              <EmptyState title={t('vitals.noneRecorded')} description={t('history.vitalsAppearDesc')} />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">{t('history.recorded')}</th>
                      <th className="px-2 py-2">{t('vitals.bpAbbr')}</th>
                      <th className="px-2 py-2">{t('vitals.hrAbbr')}</th>
                      <th className="px-2 py-2">{t('vitals.tempAbbr')}</th>
                      <th className="px-2 py-2">{t('vitals.spo2')}</th>
                      <th className="px-2 py-2">{t('vitals.rrAbbr')}</th>
                      <th className="px-2 py-2">{t('history.flag')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {vitalsHistory.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50">
                        <td className="px-2 py-2">{new Date(item.recorded_at).toLocaleString()}</td>
                        <td className="px-2 py-2">{item.blood_pressure_systolic || '-'} / {item.blood_pressure_diastolic || '-'}</td>
                        <td className="px-2 py-2">{item.heart_rate || '-'}</td>
                        <td className="px-2 py-2">{item.temperature_fahrenheit || '-'}</td>
                        <td className="px-2 py-2">{item.oxygen_saturation || '-'}</td>
                        <td className="px-2 py-2">{item.respiratory_rate || '-'}</td>
                        <td className="px-2 py-2">
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${
                              item.flagged_abnormal ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                            }`}
                          >
                            {item.flagged_abnormal ? t('history.abnormal') : t('history.normal')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}

export default function NursePatientHistoryPage() {
  return (
    <RoleGuard allowedRoles={['Nurse', 'Administrator']}>
      <NursePatientHistoryContent />
    </RoleGuard>
  );
}
