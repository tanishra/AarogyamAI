'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AuthGuard, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import {
  AnimatedButton,
  AppShell,
  EmptyState,
  PageHeader,
  Skeleton,
} from '@/components/common';

interface Encounter {
  sessionId: string;
  completedAt: string;
  priority?: string;
  durationMinutes?: number;
  doctorName?: string;
  nurseName?: string;
  summary?: {
    chiefComplaint?: string;
    symptoms?: string[];
    duration?: string;
    severity?: string;
  };
  clinicalReasoning?: {
    differentialDiagnosis?: string[];
    diagnosticPlan?: string;
    finalNotes?: string;
  };
}

interface VitalRecord {
  id: string;
  recordedAt?: string;
  recorded_at?: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  temperatureFahrenheit?: number;
  oxygenSaturation?: number;
  flaggedAbnormal?: boolean;
  flagged_abnormal?: boolean;
}

function PatientHistoryContent() {
  const { token, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const patientId = params.id as string;

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['patient-full-history', patientId],
    enabled: !!token && !!patientId,
    queryFn: async () => {
      const response = await fetch(`/api/doctor/patient/${patientId}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load patient history');
      return response.json();
    },
  });

  const encounters = historyData?.data?.completedEncounters || [];
  const vitalsHistory = historyData?.data?.vitalsHistory || [];

  return (
    <AppShell tone="doctor">
      <PageHeader
        title={t('history.pageTitle')}
        subtitle={t('history.pageSubtitle')}
        actions={
          <div className="flex items-center gap-2">
            <AnimatedButton variant="secondary" onClick={() => router.back()}>
              {t('common.back')}
            </AnimatedButton>
            <AnimatedButton variant="secondary" onClick={logout}>
              {t('nav.logout')}
            </AnimatedButton>
          </div>
        }
      />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : encounters.length === 0 ? (
        <EmptyState
          title={t('history.noEncounters')}
          description={t('history.noEncountersDesc')}
        />
      ) : (
        <div className="space-y-6">
          <div className="ui-surface p-6">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">
              {t('history.encounters', { count: encounters.length })}
            </h2>
            
            <div className="space-y-4">
              {encounters.map((encounter: Encounter) => (
                <div
                  key={encounter.sessionId}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-base font-semibold text-slate-900">
                          {new Date(encounter.completedAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })}
                        </h3>
                        {encounter.priority && (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            encounter.priority === 'emergency' ? 'bg-red-100 text-red-700' :
                            encounter.priority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {encounter.priority}
                          </span>
                        )}
                      </div>
                      
                      <p className="mt-1 text-sm text-slate-600">
                        {t('history.durationMin', { count: encounter.durationMinutes ?? 0 })}
                        {encounter.doctorName && ` • ${t('history.doctorLabel', { name: encounter.doctorName })}`}
                        {encounter.nurseName && ` • ${t('dash.nurseLabel', { name: encounter.nurseName })}`}
                      </p>

                      {encounter.summary && (
                        <div className="mt-4 space-y-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              {t('queue.complaint')}
                            </p>
                            <p className="mt-1 text-sm text-slate-800">
                              {encounter.summary.chiefComplaint}
                            </p>
                          </div>

                          {encounter.summary.symptoms && encounter.summary.symptoms.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('common.symptoms')}
                              </p>
                              <p className="mt-1 text-sm text-slate-800">
                                {encounter.summary.symptoms.join(', ')}
                              </p>
                            </div>
                          )}

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('history.duration')}
                              </p>
                              <p className="mt-1 text-sm text-slate-800">
                                {encounter.summary.duration}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                {t('history.severity')}
                              </p>
                              <p className="mt-1 text-sm text-slate-800">
                                {encounter.summary.severity}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {encounter.clinicalReasoning && (
                        <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                            {t('history.clinicalAssessment')}
                          </p>

                          {encounter.clinicalReasoning.differentialDiagnosis && (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-slate-700">
                                {t('history.diffDiagnosis')}
                              </p>
                              <ul className="mt-1 space-y-1">
                                {encounter.clinicalReasoning.differentialDiagnosis.map((dx: string, idx: number) => (
                                  <li key={idx} className="text-sm text-slate-800">
                                    <span className="mr-2 text-indigo-600">•</span>
                                    {dx}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {encounter.clinicalReasoning.diagnosticPlan && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-slate-700">
                                {t('history.treatmentPlan')}
                              </p>
                              <p className="mt-1 text-sm text-slate-800">
                                {encounter.clinicalReasoning.diagnosticPlan}
                              </p>
                            </div>
                          )}

                          {encounter.clinicalReasoning.finalNotes && (
                            <div className="mt-3">
                              <p className="text-xs font-semibold text-slate-700">
                                {t('review.notes')}
                              </p>
                              <p className="mt-1 text-sm text-slate-800">
                                {encounter.clinicalReasoning.finalNotes}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {vitalsHistory.length > 0 && (
            <div className="ui-surface p-6">
              <h2 className="mb-4 text-lg font-semibold text-slate-900">
                {t('history.vitalsHistoryCount', { count: vitalsHistory.length })}
              </h2>
              
              <div className="space-y-3">
                {vitalsHistory.map((vital: VitalRecord) => (
                  <div
                    key={vital.id}
                    className="rounded-xl border border-slate-200 bg-white p-4"
                  >
                    <p className="text-sm font-semibold text-slate-900">
                      {new Date(vital.recordedAt || vital.recorded_at || '').toLocaleDateString()}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                      {vital.bloodPressureSystolic && (
                        <p>
                          <span className="text-slate-500">{t('vitals.bpAbbr')}:</span>{' '}
                          <span className="font-semibold text-slate-800">
                            {vital.bloodPressureSystolic}/{vital.bloodPressureDiastolic}
                          </span>
                        </p>
                      )}
                      {vital.heartRate && (
                        <p>
                          <span className="text-slate-500">{t('vitals.hrAbbr')}:</span>{' '}
                          <span className="font-semibold text-slate-800">{vital.heartRate}</span>
                        </p>
                      )}
                      {vital.temperatureFahrenheit && (
                        <p>
                          <span className="text-slate-500">{t('vitals.tempAbbr')}:</span>{' '}
                          <span className="font-semibold text-slate-800">
                            {vital.temperatureFahrenheit}°F
                          </span>
                        </p>
                      )}
                      {vital.oxygenSaturation && (
                        <p>
                          <span className="text-slate-500">{t('vitals.spo2')}:</span>{' '}
                          <span className="font-semibold text-slate-800">
                            {vital.oxygenSaturation}%
                          </span>
                        </p>
                      )}
                    </div>
                    {(vital.flaggedAbnormal || vital.flagged_abnormal) && (
                      <p className="mt-2 text-xs font-semibold text-rose-600">
                        {t('history.abnormalDetected')}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}

export default function PatientHistoryPage() {
  return (
    <AuthGuard>
      <PatientHistoryContent />
    </AuthGuard>
  );
}
