'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AppShell, PageHeader, AnimatedButton, EmptyState, Skeleton, StatTile } from '@/components/common';
import { RoleGuard, useAuth } from '@/lib/auth';

interface MedicalHistoryPayload {
  sessionId: string | null;
  medicalHistory: string[];
  currentMedications: string[];
  allergies: string[];
  familyHistory: string[];
  socialHistory: Record<string, unknown>;
  lastUpdated: string | null;
}

function asLines(value: string[]): string {
  return value.join('\n');
}

function parseLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function PatientHistoryContent() {
  const { token, logout } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState<'profile' | 'encounters'>('profile');
  const [formState, setFormState] = useState({
    medicalHistory: '',
    currentMedications: '',
    allergies: '',
    familyHistory: '',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['patient-medical-history'],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch('/api/patient/medical-history', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load medical history');
      }

      const payload = await response.json();
      return payload?.data as MedicalHistoryPayload;
    },
  });

  const { data: encountersData, isLoading: encountersLoading } = useQuery({
    queryKey: ['patient-encounters'],
    enabled: !!token && viewMode === 'encounters',
    queryFn: async () => {
      const response = await fetch('/api/patient/encounters', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load encounters');
      }

      const result = await response.json();
      console.log('[Patient History] Encounters data:', result);
      console.log('[Patient History] First encounter:', result?.data?.encounters?.[0]);
      return result;
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/patient/medical-history', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          medicalHistory: parseLines(formState.medicalHistory),
          currentMedications: parseLines(formState.currentMedications),
          allergies: parseLines(formState.allergies),
          familyHistory: parseLines(formState.familyHistory),
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Failed to save history');
      }

      return response.json();
    },
    onSuccess: async () => {
      setIsEditing(false);
      await refetch();
    },
  });

  const populated = useMemo(() => {
    if (!data) return null;
    return {
      medicalHistory: data.medicalHistory || [],
      currentMedications: data.currentMedications || [],
      allergies: data.allergies || [],
      familyHistory: data.familyHistory || [],
      lastUpdated: data.lastUpdated,
    };
  }, [data]);

  const startEditing = () => {
    if (!populated) return;
    setFormState({
      medicalHistory: asLines(populated.medicalHistory),
      currentMedications: asLines(populated.currentMedications),
      allergies: asLines(populated.allergies),
      familyHistory: asLines(populated.familyHistory),
    });
    setIsEditing(true);
  };

  return (
    <AppShell tone="patient">
      <PageHeader
        title="Medical History"
        subtitle="Review and maintain your structured clinical background for faster consults"
        badge="Patient"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/patient/dashboard">
              <AnimatedButton variant="secondary">Back to Dashboard</AnimatedButton>
            </Link>
            <AnimatedButton variant="secondary" onClick={logout}>Logout</AnimatedButton>
          </div>
        }
      />

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-blue-200/70 bg-gradient-to-r from-[#eaf4ff] via-[#f5fbff] to-[#ecfffb] p-5 animate-fade-up">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-blue-200/45 blur-3xl" />
        <h2 className="text-lg font-semibold text-slate-900">Keep your clinical history current</h2>
        <p className="mt-1 text-sm text-slate-600">
          Up-to-date history, medications, and allergies help clinicians triage accurately and safely.
        </p>
      </section>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Conditions" value={populated?.medicalHistory.length || 0} trend="Known conditions" />
        <StatTile label="Medications" value={populated?.currentMedications.length || 0} trend="Current prescriptions" />
        <StatTile label="Allergies" value={populated?.allergies.length || 0} trend="Safety-critical" tone={(populated?.allergies.length || 0) > 0 ? 'warning' : 'default'} />
        <StatTile
          label="Completed Visits"
          value={encountersData?.data?.count || 0}
          trend="Clinical encounters"
        />
      </div>

      <div className="mb-5 flex gap-2">
        <AnimatedButton
          variant={viewMode === 'profile' ? 'primary' : 'secondary'}
          onClick={() => setViewMode('profile')}
        >
          Medical Profile
        </AnimatedButton>
        <AnimatedButton
          variant={viewMode === 'encounters' ? 'primary' : 'secondary'}
          onClick={() => setViewMode('encounters')}
        >
          Visit History
        </AnimatedButton>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : viewMode === 'encounters' ? (
        encountersLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : !encountersData?.data?.encounters || encountersData.data.encounters.length === 0 ? (
          <EmptyState 
            title="No completed visits" 
            description="Your completed clinical encounters will appear here after your doctor approves the treatment plan." 
          />
        ) : (
          <div className="space-y-4">
            {encountersData.data.encounters.map((encounter: any) => {
              console.log('[Patient History] Rendering encounter:', encounter.sessionId, {
                hasClinicalReasoning: !!encounter.clinicalReasoning,
                diagnosticPlan: encounter.clinicalReasoning?.diagnosticPlan,
                differentialDiagnosis: encounter.clinicalReasoning?.differentialDiagnosis,
              });
              return (
              <div
                key={encounter.sessionId}
                className="ui-surface ui-surface-hover p-5"
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
                      Duration: {encounter.durationMinutes} minutes
                      {encounter.doctorName && ` • Doctor: ${encounter.doctorName}`}
                      {encounter.nurseName && ` • Nurse: ${encounter.nurseName}`}
                    </p>

                    {encounter.summary && (
                      <div className="mt-4 space-y-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Chief Complaint
                          </p>
                          <p className="mt-1 text-sm text-slate-800">
                            {encounter.summary.chiefComplaint}
                          </p>
                        </div>

                        {encounter.summary.symptoms && encounter.summary.symptoms.length > 0 && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                              Symptoms
                            </p>
                            <p className="mt-1 text-sm text-slate-800">
                              {encounter.summary.symptoms.join(', ')}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {encounter.clinicalReasoning && (
                      <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                          Treatment Plan
                        </p>

                        {encounter.clinicalReasoning.differentialDiagnosis && encounter.clinicalReasoning.differentialDiagnosis.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-slate-700">
                              Diagnosis
                            </p>
                            <ul className="mt-1 space-y-1">
                              {encounter.clinicalReasoning.differentialDiagnosis.map((dx: string, idx: number) => (
                                <li key={idx} className="text-sm text-slate-800">
                                  <span className="mr-2 text-blue-600">•</span>
                                  {dx}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {encounter.clinicalReasoning.diagnosticPlan && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-slate-700">
                              Treatment Plan
                            </p>
                            <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">
                              {encounter.clinicalReasoning.diagnosticPlan}
                            </p>
                          </div>
                        )}

                        {encounter.clinicalReasoning.finalNotes && (
                          <div className="mt-3">
                            <p className="text-xs font-semibold text-slate-700">
                              Doctor's Notes
                            </p>
                            <p className="mt-1 text-sm text-slate-800 whitespace-pre-wrap">
                              {encounter.clinicalReasoning.finalNotes}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {encounter.considerations && encounter.considerations.length > 0 && (
                      <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Clinical Assessment
                        </p>
                        <div className="mt-2 space-y-3">
                          {encounter.considerations.map((consideration: any, idx: number) => (
                            <div key={idx} className="rounded-lg border border-emerald-200 bg-white p-3">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-slate-900">
                                  {consideration.conditionName}
                                </p>
                                <div className="flex gap-2">
                                  {consideration.likelihood && (
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                      consideration.likelihood === 'high' ? 'bg-rose-100 text-rose-700' :
                                      consideration.likelihood === 'moderate' ? 'bg-amber-100 text-amber-700' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>
                                      {consideration.likelihood}
                                    </span>
                                  )}
                                  {consideration.urgency && (
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                      consideration.urgency === 'urgent' ? 'bg-red-100 text-red-700' :
                                      consideration.urgency === 'routine' ? 'bg-blue-100 text-blue-700' :
                                      'bg-slate-100 text-slate-600'
                                    }`}>
                                      {consideration.urgency}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {consideration.explanation && (
                                <p className="mt-2 text-xs text-slate-600">
                                  {consideration.explanation}
                                </p>
                              )}
                              {consideration.doctorNotes && (
                                <div className="mt-2 rounded bg-blue-50 p-2">
                                  <p className="text-xs font-semibold text-blue-700">Doctor's Notes:</p>
                                  <p className="mt-1 text-xs text-slate-700">{consideration.doctorNotes}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
            })}
          </div>
        )
      ) : !populated ? (
        <EmptyState title="No history found" description="Complete your first intake chat to initialize your medical history profile." />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="ui-surface ui-surface-hover p-5 animate-fade-up">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Clinical Summary</h2>
              {!isEditing ? (
                <AnimatedButton onClick={startEditing}>Edit</AnimatedButton>
              ) : (
                <div className="flex items-center gap-2">
                  <AnimatedButton
                    variant="secondary"
                    onClick={() => setIsEditing(false)}
                    disabled={updateMutation.isPending}
                  >
                    Cancel
                  </AnimatedButton>
                  <AnimatedButton
                    onClick={() => updateMutation.mutate()}
                    disabled={updateMutation.isPending}
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </AnimatedButton>
                </div>
              )}
            </div>

            {!isEditing ? (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Past Medical History</p>
                  <ul className="mt-2 space-y-2">
                    {(populated.medicalHistory.length ? populated.medicalHistory : ['No known conditions added']).map((item) => (
                      <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Medications</p>
                  <ul className="mt-2 space-y-2">
                    {(populated.currentMedications.length ? populated.currentMedications : ['No medications listed']).map((item) => (
                      <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Past Medical History</span>
                  <textarea
                    rows={5}
                    value={formState.medicalHistory}
                    onChange={(event) => setFormState((prev) => ({ ...prev, medicalHistory: event.target.value }))}
                    className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="One item per line"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Current Medications</span>
                  <textarea
                    rows={5}
                    value={formState.currentMedications}
                    onChange={(event) => setFormState((prev) => ({ ...prev, currentMedications: event.target.value }))}
                    className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="One item per line"
                  />
                </label>
              </div>
            )}
          </section>

          <section className="ui-surface ui-surface-hover p-5 animate-fade-up delay-1">
            <h2 className="text-lg font-bold text-slate-900">Safety Profile</h2>
            <p className="mt-1 text-sm text-slate-500">Keep high-risk details current so the care team can triage safely.</p>

            {!isEditing ? (
              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Allergies</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(populated.allergies.length ? populated.allergies : ['No allergies recorded']).map((item) => (
                      <span
                        key={item}
                        className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 transition-transform hover:scale-105"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Family History</p>
                  <ul className="mt-2 space-y-2">
                    {(populated.familyHistory.length ? populated.familyHistory : ['No family history listed']).map((item) => (
                      <li key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Allergies</span>
                  <textarea
                    rows={4}
                    value={formState.allergies}
                    onChange={(event) => setFormState((prev) => ({ ...prev, allergies: event.target.value }))}
                    className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="One item per line"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Family History</span>
                  <textarea
                    rows={4}
                    value={formState.familyHistory}
                    onChange={(event) => setFormState((prev) => ({ ...prev, familyHistory: event.target.value }))}
                    className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    placeholder="One item per line"
                  />
                </label>
              </div>
            )}

            {updateMutation.error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {(updateMutation.error as Error).message}
              </p>
            ) : null}
          </section>
        </div>
      )}
    </AppShell>
  );
}

export default function PatientHistoryPage() {
  return (
    <RoleGuard allowedRoles={['Patient']}>
      <PatientHistoryContent />
    </RoleGuard>
  );
}
