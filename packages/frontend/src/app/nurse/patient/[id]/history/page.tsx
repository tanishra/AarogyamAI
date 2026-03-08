'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { RoleGuard, useAuth } from '@/lib/auth';
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
  const vitalsHistory = data?.vitalsHistory || [];

  const abnormalCount = useMemo(
    () => vitalsHistory.filter((item) => Boolean(item.flagged_abnormal)).length,
    [vitalsHistory]
  );

  return (
    <AppShell tone="nurse">
      <PageHeader
        title="Patient History View"
        subtitle="Review context before triage and vitals workflow"
        badge="Nurse"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/nurse/dashboard">
              <AnimatedButton variant="secondary">Back to Dashboard</AnimatedButton>
            </Link>
            <AnimatedButton variant="secondary" onClick={logout}>Logout</AnimatedButton>
          </div>
        }
      />

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-blue-200/70 bg-gradient-to-r from-[#eaf4ff] via-[#f4fbff] to-[#edfff8] p-5 animate-fade-up">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-blue-200/45 blur-3xl" />
        <h2 className="text-lg font-semibold text-slate-900">Context-first patient history review</h2>
        <p className="mt-1 text-sm text-slate-600">
          Verify allergies, prior sessions, and vitals trends before entering new measurements.
        </p>
      </section>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Recent Sessions" value={history?.recentSessions?.length || 0} trend="Last 10 interactions" />
        <StatTile label="Vitals Records" value={vitalsHistory.length} trend="Last 20 captures" />
        <StatTile label="Abnormal Flags" value={abnormalCount} trend="Needs attention" tone={abnormalCount > 0 ? 'warning' : 'default'} />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : !history?.patient ? (
        <EmptyState title="Patient not found" description="The requested patient history could not be loaded." />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <section className="space-y-5 lg:col-span-5">
            <div className="ui-surface ui-surface-hover p-5 animate-fade-up">
              <h2 className="text-lg font-bold text-slate-900">Patient Summary</h2>
              <p className="mt-1 text-sm text-slate-500">{history.patient.name} • {history.patient.email}</p>

              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chief Complaint</p>
                  <p className="mt-1 text-sm text-slate-800">{history.summary?.chief_complaint || 'Not captured'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Symptoms</p>
                  <p className="mt-1 text-sm text-slate-800">{history.summary?.symptoms?.join(', ') || 'Not captured'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Allergies</p>
                  <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {history.summary?.allergies?.join(', ') || 'No known allergies'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Medications</p>
                  <p className="mt-1 text-sm text-slate-800">{history.summary?.current_medications?.join(', ') || 'Not listed'}</p>
                </div>
              </div>
            </div>

            <div className="ui-surface ui-surface-hover p-5 animate-fade-up delay-1">
              <h3 className="text-base font-semibold text-slate-900">Recent Intake Sessions</h3>
              <div className="mt-3 space-y-2">
                {(history.recentSessions || []).map((session) => (
                  <div
                    key={session.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 transition-transform hover:scale-[1.01]"
                  >
                    <p className="font-semibold text-slate-900">{new Date(session.started_at).toLocaleString()}</p>
                    <p className="text-xs text-slate-500">
                      {session.status}
                      {session.emergency_detected ? ' • Emergency detected' : ''}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="ui-surface ui-surface-hover p-5 animate-fade-up delay-2 lg:col-span-7">
            <h2 className="text-lg font-bold text-slate-900">Vitals History</h2>
            <p className="mt-1 text-sm text-slate-500">Trend overview for safe triage decisions.</p>

            {vitalsHistory.length === 0 ? (
              <EmptyState title="No vitals recorded" description="Vitals history will appear here after nurse entries." />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">Recorded</th>
                      <th className="px-2 py-2">BP</th>
                      <th className="px-2 py-2">HR</th>
                      <th className="px-2 py-2">Temp</th>
                      <th className="px-2 py-2">SpO2</th>
                      <th className="px-2 py-2">RR</th>
                      <th className="px-2 py-2">Flag</th>
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
                            {item.flagged_abnormal ? 'Abnormal' : 'Normal'}
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
