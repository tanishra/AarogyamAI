'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGuard, useAuth } from '@/lib/auth';
import {
  AnimatedButton,
  AppShell,
  EmptyState,
  PanelTabs,
  PageHeader,
  Skeleton,
  StatTile,
} from '@/components/common';
import { AIConsiderationsPanel } from '@/components/doctor/AIConsiderationsPanel';
import { ClinicalReasoningForm } from '@/components/doctor/ClinicalReasoningForm';
import { ProfileWorkspace } from '@/components/profile/ProfileWorkspace';

interface QueuePatient {
  queue_id: string;
  patient_id: string;
  session_id: string;
  patient_name: string;
  patient_email: string;
  status: string;
  priority: 'emergency' | 'urgent' | 'routine';
  nurse_name?: string;
}

interface Consideration {
  id: string;
  conditionName: string;
  likelihood: 'high' | 'moderate' | 'low';
  urgency: 'urgent' | 'routine' | 'non-urgent';
  supportingFactors: string[];
  explanation: string;
  status: 'pending' | 'accepted' | 'modified' | 'rejected';
}

interface DoctorHistoryPayload {
  sessions?: Array<{ id: string; status: string; startedAt?: string; started_at?: string }>;
  vitalsHistory?: Array<{ id: string; recordedAt?: string; recorded_at?: string; flaggedAbnormal?: boolean; flagged_abnormal?: boolean }>;
  reasoningHistory?: Array<{ id: string; status?: string; created_at?: string }>;
}
type DashboardTab = 'workflow' | 'history' | 'profile';

function DoctorDashboardContent() {
  const { token, user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [selectedPatient, setSelectedPatient] = useState<QueuePatient | null>(null);
  const [patientContext, setPatientContext] = useState<any>(null);
  const [considerations, setConsiderations] = useState<Consideration[]>([]);
  const [reasoning, setReasoning] = useState({
    differentialDiagnosis: '',
    diagnosticPlan: '',
    reasoningRationale: '',
    finalNotes: '',
  });
  const [reasoningId, setReasoningId] = useState<string | null>(null);
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('workflow');

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['doctorQueue'],
    queryFn: async () => {
      const response = await fetch('/api/doctor/queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch doctor queue');
      return response.json();
    },
    refetchInterval: 30000,
    enabled: !!token,
  });

  const patients: QueuePatient[] = queueData?.data?.patients || [];

  const activeCount = useMemo(() => patients.length, [patients]);
  const urgentCount = useMemo(() => patients.filter((p) => p.priority !== 'routine').length, [patients]);
  const underReviewCount = useMemo(() => patients.filter((p) => p.status === 'under_review').length, [patients]);
  const unassignedNurseCount = useMemo(() => patients.filter((p) => !p.nurse_name).length, [patients]);

  const { data: historyData } = useQuery({
    queryKey: ['doctor-patient-history', selectedPatient?.patient_id],
    enabled: !!token && !!selectedPatient?.patient_id,
    queryFn: async () => {
      const response = await fetch(`/api/doctor/patient/${selectedPatient!.patient_id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load patient history');
      const payload = await response.json();
      return (payload?.data || {}) as DoctorHistoryPayload;
    },
  });

  const { data: completedPatientsData } = useQuery({
    queryKey: ['doctor-completed-patients'],
    enabled: !!token && dashboardTab === 'history',
    queryFn: async () => {
      const response = await fetch('/api/doctor/completed-patients', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load completed patients');
      return response.json();
    },
  });

  const fetchPatientContext = async (patient: QueuePatient) => {
    const response = await fetch(`/api/doctor/patient/${patient.patient_id}/context?sessionId=${patient.session_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) throw new Error('Failed to fetch patient context');
    const payload = await response.json();

    setPatientContext(payload?.data || null);
    setSelectedPatient(patient);
    setConsiderations(payload?.data?.considerations || []);

    if (payload?.data?.reasoning) {
      const existing = payload.data.reasoning;
      setReasoningId(existing.id);
      setReasoning({
        differentialDiagnosis: Array.isArray(existing.differentialDiagnosis)
          ? existing.differentialDiagnosis.join('\n')
          : '',
        diagnosticPlan: existing.diagnosticPlan || '',
        reasoningRationale: existing.reasoningRationale || '',
        finalNotes: existing.finalNotes || '',
      });
    } else {
      setReasoningId(null);
      setReasoning({
        differentialDiagnosis: '',
        diagnosticPlan: '',
        reasoningRationale: '',
        finalNotes: '',
      });
    }

    // Refetch history to get latest vitals count
    await queryClient.invalidateQueries({ queryKey: ['doctor-patient-history', patient.patient_id] });
  };

  const generateConsiderationsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return null;
      const response = await fetch(`/api/doctor/patient/${selectedPatient.patient_id}/considerations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: selectedPatient.session_id }),
      });
      if (!response.ok) throw new Error('Failed to generate considerations');
      return response.json();
    },
    onSuccess: (payload) => {
      if (payload?.data?.considerations) {
        setConsiderations(payload.data.considerations);
      }
    },
  });

  const updateConsiderationMutation = useMutation({
    mutationFn: async ({ considerationId, status }: { considerationId: string; status: string }) => {
      const response = await fetch(`/api/doctor/consideration/${considerationId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ considerationId, status }),
      });
      if (!response.ok) throw new Error('Failed to update consideration');
      return response.json();
    },
    onSuccess: () => {
      if (selectedPatient) {
        void fetchPatientContext(selectedPatient);
      }
    },
  });

  const saveReasoningMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return null;
      const response = await fetch(`/api/doctor/patient/${selectedPatient.patient_id}/reasoning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: selectedPatient.session_id,
          differentialDiagnosis: reasoning.differentialDiagnosis
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean),
          diagnosticPlan: reasoning.diagnosticPlan,
          reasoningRationale: reasoning.reasoningRationale,
          finalNotes: reasoning.finalNotes,
        }),
      });
      if (!response.ok) throw new Error('Failed to save reasoning');
      return response.json();
    },
    onSuccess: (payload) => {
      if (payload?.data?.reasoningId) {
        setReasoningId(payload.data.reasoningId);
      }
    },
  });

  const approveReasoningMutation = useMutation({
    mutationFn: async () => {
      if (!reasoningId) return null;
      const response = await fetch(`/api/doctor/reasoning/${reasoningId}/approve`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error('Failed to approve reasoning');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doctorQueue'] });
      setSelectedPatient(null);
      setPatientContext(null);
      setConsiderations([]);
      setReasoningId(null);
      setReasoning({
        differentialDiagnosis: '',
        diagnosticPlan: '',
        reasoningRationale: '',
        finalNotes: '',
      });
    },
  });

  const getPriorityStyle = (priority: QueuePatient['priority']) => {
    if (priority === 'emergency') return 'bg-red-100 text-red-700';
    if (priority === 'urgent') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  const vitals = patientContext?.vitals;
  const summary = patientContext?.summary;

  return (
    <AppShell tone="doctor">
      <PageHeader
        title="Doctor Review Dashboard"
        subtitle="AI-assisted differential framing with physician-in-control approval"
        badge={`${activeCount} Ready`}
        actions={
          <div className="flex items-center gap-2">
            <AnimatedButton variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ['doctorQueue'] })}>
              Refresh
            </AnimatedButton>
            <AnimatedButton variant="secondary" onClick={logout}>Logout</AnimatedButton>
          </div>
        }
      />

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-r from-[#eef2ff] via-[#f7f9ff] to-[#ecfffb] p-5 animate-fade-up">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-indigo-200/45 blur-3xl" />
        <h2 className="text-xl font-semibold text-slate-900">Physician decision workspace</h2>
        <p className="mt-1 text-sm text-slate-600">
          Review nurse-prepared context, evaluate AI considerations, and approve final clinical reasoning.
        </p>
      </section>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile label="Pending Reviews" value={activeCount} trend="Awaiting physician action" />
        <StatTile label="Urgent Cases" value={urgentCount} trend="Prioritized in queue" tone={urgentCount > 0 ? 'warning' : 'default'} />
        <StatTile label="Under Review" value={underReviewCount} trend="Already opened by a doctor" />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile label="On Duty" value={user?.name || 'Doctor'} trend={user?.email || ''} />
        <StatTile label="No Nurse Assigned" value={unassignedNurseCount} trend="Need intake owner visibility" tone={unassignedNurseCount > 0 ? 'warning' : 'default'} />
        <StatTile label="Queue Health" value={activeCount > 0 ? 'Active' : 'Clear'} trend="Live queue status" />
      </div>

      <PanelTabs
        tabs={[
          { id: 'workflow', label: 'Workflow' },
          { id: 'history', label: 'Completed Patients' },
          { id: 'profile', label: 'My Profile' },
        ]}
        value={dashboardTab}
        onChange={setDashboardTab}
      />

      {dashboardTab === 'profile' ? (
        <ProfileWorkspace role="Doctor" />
      ) : dashboardTab === 'history' ? (
        <div className="ui-surface p-6">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">Completed Patients</h2>
          <p className="mb-6 text-sm text-slate-600">
            View your previously treated patients and their clinical outcomes.
          </p>
          
          {!completedPatientsData ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : completedPatientsData?.data?.patients?.length === 0 ? (
            <EmptyState 
              title="No completed patients yet" 
              description="Patients you've treated will appear here after you approve their clinical reasoning." 
            />
          ) : (
            <div className="space-y-3">
              {completedPatientsData?.data?.patients?.map((patient: any) => (
                <div
                  key={patient.patientId}
                  className="rounded-2xl border border-slate-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <h3 className="text-base font-semibold text-slate-900">{patient.patientName}</h3>
                      <p className="mt-1 text-sm text-slate-600">{patient.patientEmail}</p>
                      
                      {patient.lastComplaint && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last Visit</p>
                          <p className="mt-1 text-sm text-slate-700">{patient.lastComplaint}</p>
                        </div>
                      )}
                      
                      {patient.lastPlan && (
                        <div className="mt-2">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Treatment Plan</p>
                          <p className="mt-1 text-sm text-slate-700 line-clamp-2">{patient.lastPlan}</p>
                        </div>
                      )}
                      
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
                          Last visit: {new Date(patient.lastVisit).toLocaleDateString()}
                        </span>
                        {patient.lastPriority && (
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            patient.lastPriority === 'emergency' ? 'bg-red-100 text-red-700' :
                            patient.lastPriority === 'urgent' ? 'bg-amber-100 text-amber-700' :
                            'bg-slate-100 text-slate-600'
                          }`}>
                            {patient.lastPriority}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <Link href={`/doctor/patient/${patient.patientId}/history`}>
                      <AnimatedButton size="sm" variant="secondary">
                        View Full History
                      </AnimatedButton>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-4">
          <div className="ui-surface overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Patient Queue</h2>
            </div>
            <div className="max-h-[72vh] divide-y divide-slate-200 overflow-y-auto">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : patients.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No pending patients" description="Queue is clear for now." />
                </div>
              ) : (
                patients.map((patient) => (
                  <button
                    key={patient.queue_id}
                    onClick={() => {
                      void fetchPatientContext(patient);
                    }}
                    className={`w-full px-4 py-4 text-left transition-all hover:bg-indigo-50/50 ${
                      selectedPatient?.queue_id === patient.queue_id ? 'bg-gradient-to-r from-indigo-50 to-cyan-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{patient.patient_name}</p>
                        <p className="mt-1 text-xs text-slate-500">Nurse: {patient.nurse_name || 'Unassigned'}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${getPriorityStyle(patient.priority)}`}>
                        {patient.priority}
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="space-y-5 lg:col-span-8">
          {!selectedPatient ? (
            <EmptyState
              title="Select a patient"
              description="Choose a patient from the queue to review full context and AI considerations."
            />
          ) : (
            <>
              <div className="ui-surface ui-surface-hover p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{selectedPatient.patient_name}</h3>
                    <p className="mt-1 text-sm text-slate-500">Comprehensive context prepared for physician review</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${getPriorityStyle(selectedPatient.priority)}`}>
                    {selectedPatient.priority}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/doctor/patient/${selectedPatient.patient_id}/review?sessionId=${selectedPatient.session_id}`}>
                    <AnimatedButton size="sm" variant="secondary">Open Dedicated Review Page</AnimatedButton>
                  </Link>
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                    Nurse: {selectedPatient.nurse_name || 'Unassigned'}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                    Queue status: {selectedPatient.status}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chief Complaint</p>
                    <p className="mt-1 text-sm text-slate-800">{summary?.chiefComplaint || 'Not captured yet'}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Symptoms</p>
                    <p className="mt-1 text-sm text-slate-800">{summary?.symptoms?.join(', ') || 'Not captured yet'}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nurse Vitals</p>
                  {vitals ? (
                    <>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-slate-700 sm:grid-cols-3 lg:grid-cols-6">
                        <p>BP: <span className="font-semibold">{vitals.bloodPressureSystolic || '-'}/{vitals.bloodPressureDiastolic || '-'}</span></p>
                        <p>HR: <span className="font-semibold">{vitals.heartRate || '-'}</span> bpm</p>
                        <p>Temp: <span className="font-semibold">{vitals.temperatureFahrenheit || '-'}</span> °F</p>
                        <p>SpO2: <span className="font-semibold">{vitals.oxygenSaturation || '-'}</span>%</p>
                        <p>RR: <span className="font-semibold">{vitals.respiratoryRate || '-'}</span> /min</p>
                        <p>BMI: <span className="font-semibold">{vitals.bmi || '-'}</span></p>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-3 text-sm text-slate-700 sm:grid-cols-3">
                        <p>Height: <span className="font-semibold">{vitals.heightCm || '-'}</span> cm</p>
                        <p>Weight: <span className="font-semibold">{vitals.weightKg || '-'}</span> kg</p>
                      </div>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-slate-500">No vitals recorded yet</p>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Prior Sessions</p>
                    <p className="mt-1 text-lg font-semibold text-indigo-900">{historyData?.sessions?.length || 0}</p>
                  </div>
                  <div className="rounded-xl border border-cyan-200 bg-cyan-50/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-cyan-700">Vitals Records</p>
                    <p className="mt-1 text-lg font-semibold text-cyan-900">{historyData?.vitalsHistory?.length || 0}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Reasoning History</p>
                    <p className="mt-1 text-lg font-semibold text-emerald-900">{historyData?.reasoningHistory?.length || 0}</p>
                  </div>
                </div>
              </div>

              <AIConsiderationsPanel
                considerations={considerations}
                onGenerate={() => generateConsiderationsMutation.mutate()}
                onUpdateStatus={(considerationId, status) =>
                  updateConsiderationMutation.mutate({ considerationId, status })
                }
                isGenerating={generateConsiderationsMutation.isPending}
              />

              <ClinicalReasoningForm
                reasoning={reasoning}
                onChange={(field, value) => setReasoning((prev) => ({ ...prev, [field]: value }))}
                onSave={() => saveReasoningMutation.mutate()}
                onApprove={() => approveReasoningMutation.mutate()}
                isSaving={saveReasoningMutation.isPending}
                isApproving={approveReasoningMutation.isPending}
                reasoningId={reasoningId}
              />
            </>
          )}
        </section>
      </div>
      )}
    </AppShell>
  );
}

export default function DoctorDashboardPage() {
  return (
    <AuthGuard>
      <DoctorDashboardContent />
    </AuthGuard>
  );
}
