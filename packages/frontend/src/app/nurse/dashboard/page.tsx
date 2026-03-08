'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AuthGuard, useAuth } from '@/lib/auth';
import {
  AnimatedButton,
  AppShell,
  EmptyState,
  PageHeader,
  PanelTabs,
  Skeleton,
  StatTile,
} from '@/components/common';
import { PatientHistoryPanel } from '@/components/nurse/PatientHistoryPanel';
import { ProfileWorkspace } from '@/components/profile/ProfileWorkspace';

interface QueuePatient {
  queue_id: string;
  patient_id: string;
  session_id: string;
  patient_name: string;
  patient_email: string;
  status: string;
  priority: 'emergency' | 'urgent' | 'routine';
  chat_completed_at: string;
  emergency_detected: boolean;
}

interface Summary {
  chiefComplaint: string;
  symptoms: string[];
  duration: string;
  severity: string;
  medicalHistory: string[];
  currentMedications: string[];
  allergies: string[];
}

type NurseTab = 'vitals' | 'history';
type QueueFilter = 'all' | 'emergency' | 'urgent' | 'routine' | 'vitals_added';
type DashboardTab = 'workflow' | 'profile';

function NurseDashboardContent() {
  const { token, user, logout } = useAuth();
  const queryClient = useQueryClient();

  const [selectedPatient, setSelectedPatient] = useState<QueuePatient | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [activeTab, setActiveTab] = useState<NurseTab>('vitals');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [dashboardTab, setDashboardTab] = useState<DashboardTab>('workflow');

  const [vitals, setVitals] = useState({
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    heartRate: '',
    temperatureFahrenheit: '',
    oxygenSaturation: '',
    respiratoryRate: '',
    weightKg: '',
    heightCm: '',
    notes: '',
  });

  const { data: queueData, isLoading } = useQuery({
    queryKey: ['nurseQueue'],
    queryFn: async () => {
      const response = await fetch('/api/nurse/queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch nurse queue');
      return response.json();
    },
    refetchInterval: 30000,
    enabled: !!token,
  });

  const patients: QueuePatient[] = queueData?.data?.patients || [];

  const activeCount = useMemo(() => patients.length, [patients]);
  const emergencyCount = useMemo(() => patients.filter((p) => p.priority === 'emergency').length, [patients]);
  const vitalsAddedCount = useMemo(() => patients.filter((p) => p.status === 'vitals_added').length, [patients]);
  const avgWaitMinutes = useMemo(() => {
    if (!patients.length) return 0;
    const total = patients.reduce((sum, patient) => {
      const wait = Math.max(1, Math.floor((Date.now() - new Date(patient.chat_completed_at).getTime()) / 60000));
      return sum + wait;
    }, 0);
    return Math.round(total / patients.length);
  }, [patients]);
  const filteredPatients = useMemo(() => {
    if (queueFilter === 'all') return patients;
    if (queueFilter === 'vitals_added') return patients.filter((p) => p.status === 'vitals_added');
    return patients.filter((p) => p.priority === queueFilter);
  }, [patients, queueFilter]);

  const fetchPatientSummary = async (patient: QueuePatient) => {
    const response = await fetch(
      `/api/nurse/patient/${patient.patient_id}/summary?sessionId=${patient.session_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) throw new Error('Failed to load patient summary');
    const payload = await response.json();
    setSelectedPatient(patient);
    setSummary(payload?.data?.summary || null);
  };

  const addVitalsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;
      const response = await fetch(`/api/nurse/patient/${selectedPatient.patient_id}/vitals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientId: selectedPatient.patient_id,
          sessionId: selectedPatient.session_id,
          bloodPressureSystolic: vitals.bloodPressureSystolic ? Number(vitals.bloodPressureSystolic) : undefined,
          bloodPressureDiastolic: vitals.bloodPressureDiastolic ? Number(vitals.bloodPressureDiastolic) : undefined,
          heartRate: vitals.heartRate ? Number(vitals.heartRate) : undefined,
          temperatureFahrenheit: vitals.temperatureFahrenheit ? Number(vitals.temperatureFahrenheit) : undefined,
          oxygenSaturation: vitals.oxygenSaturation ? Number(vitals.oxygenSaturation) : undefined,
          respiratoryRate: vitals.respiratoryRate ? Number(vitals.respiratoryRate) : undefined,
          weightKg: vitals.weightKg ? Number(vitals.weightKg) : undefined,
          heightCm: vitals.heightCm ? Number(vitals.heightCm) : undefined,
          notes: vitals.notes || undefined,
        }),
      });
      if (!response.ok) throw new Error('Failed to submit vitals');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurseQueue'] });
    },
  });

  const markReadyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPatient) return;
      const response = await fetch(`/api/nurse/patient/${selectedPatient.patient_id}/ready`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId: selectedPatient.session_id }),
      });
      if (!response.ok) throw new Error('Failed to mark patient ready');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['nurseQueue'] });
      setSelectedPatient(null);
      setSummary(null);
    },
  });

  const getPriorityStyle = (priority: QueuePatient['priority']) => {
    if (priority === 'emergency') return 'bg-red-100 text-red-700';
    if (priority === 'urgent') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-600';
  };

  const tabs = [
    { id: 'vitals' as NurseTab, label: 'Vitals Entry' },
    { id: 'history' as NurseTab, label: 'Previous Vitals' },
  ];

  return (
    <AppShell tone="nurse">
      <PageHeader
        title="Nurse Intake Dashboard"
        subtitle="Review AI summary, capture vitals, and route patient for doctor review"
        badge={`${activeCount} Active`}
        actions={
          <div className="flex items-center gap-2">
            <AnimatedButton variant="secondary" onClick={() => queryClient.invalidateQueries({ queryKey: ['nurseQueue'] })}>
              Refresh
            </AnimatedButton>
            <AnimatedButton variant="secondary" onClick={logout}>Logout</AnimatedButton>
          </div>
        }
      />

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-cyan-200/70 bg-gradient-to-r from-[#e8f7ff] via-[#f2fbff] to-[#e8fffb] p-5 animate-fade-up">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-200/50 blur-2xl" />
        <h2 className="text-xl font-semibold text-slate-900">Shift workflow command center</h2>
        <p className="mt-1 text-sm text-slate-600">
          Prioritize queue patients, capture vitals with abnormal flags, and handoff complete context to doctors.
        </p>
      </section>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile label="Queue" value={activeCount} trend="Awaiting vitals" />
        <StatTile label="Emergency Priority" value={emergencyCount} trend="Immediate review" tone={emergencyCount > 0 ? 'danger' : 'default'} />
        <StatTile label="Avg Wait" value={`${avgWaitMinutes}m`} trend={`${vitalsAddedCount} with vitals captured`} />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatTile label="On Shift" value={user?.name || 'Nurse'} trend={user?.email || ''} />
        <StatTile label="Vitals Added" value={vitalsAddedCount} trend="Ready to handoff soon" tone={vitalsAddedCount > 0 ? 'success' : 'default'} />
        <StatTile label="Queue Filter" value={queueFilter.replace('_', ' ')} trend="Active queue scope" />
      </div>

      <PanelTabs
        tabs={[
          { id: 'workflow', label: 'Workflow' },
          { id: 'profile', label: 'My Profile' },
        ]}
        value={dashboardTab}
        onChange={setDashboardTab}
      />

      {dashboardTab === 'profile' ? (
        <ProfileWorkspace role="Nurse" />
      ) : (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="lg:col-span-4">
          <div className="ui-surface overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Patient Queue</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {[
                  ['all', 'All'],
                  ['emergency', 'Emergency'],
                  ['urgent', 'Urgent'],
                  ['routine', 'Routine'],
                  ['vitals_added', 'Vitals Added'],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    onClick={() => setQueueFilter(id as QueueFilter)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                      queueFilter === id
                        ? 'bg-cyan-600 text-white'
                        : 'border border-cyan-200 bg-white text-cyan-700 hover:scale-105'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="max-h-[70vh] divide-y divide-slate-200 overflow-y-auto">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : filteredPatients.length === 0 ? (
                <div className="p-4">
                  <EmptyState title="No patients in this filter" description="Try a different filter or refresh the queue." />
                </div>
              ) : (
                filteredPatients.map((patient) => (
                  <button
                    key={patient.queue_id}
                    onClick={() => {
                      void fetchPatientSummary(patient);
                    }}
                    className={`w-full px-4 py-4 text-left transition-all hover:bg-cyan-50/60 ${
                      selectedPatient?.queue_id === patient.queue_id ? 'bg-gradient-to-r from-cyan-50 to-blue-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{patient.patient_name}</p>
                        <p className="mt-1 text-xs text-slate-500">{patient.patient_email}</p>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${getPriorityStyle(patient.priority)}`}>
                        {patient.priority}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Waiting {Math.max(1, Math.floor((Date.now() - new Date(patient.chat_completed_at).getTime()) / 60000))} min
                    </p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">
                      Status: {patient.status}
                      {patient.emergency_detected ? ' • Emergency signal detected' : ''}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="lg:col-span-8">
          {!selectedPatient ? (
            <EmptyState title="Select a patient" description="Pick a patient from the queue to review AI summary and capture vitals." />
          ) : (
            <div className="space-y-5">
              <div className="ui-surface ui-surface-hover p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">{selectedPatient.patient_name}</h3>
                    <p className="mt-1 text-sm text-slate-500">Triage Status: Intake in progress</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase ${getPriorityStyle(selectedPatient.priority)}`}>
                    {selectedPatient.priority}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/nurse/vitals/${selectedPatient.patient_id}?sessionId=${selectedPatient.session_id}`}>
                    <AnimatedButton size="sm" variant="secondary">Open Dedicated Vitals Page</AnimatedButton>
                  </Link>
                  <Link href={`/nurse/patient/${selectedPatient.patient_id}/history`}>
                    <AnimatedButton size="sm" variant="secondary">Open Full Patient History</AnimatedButton>
                  </Link>
                </div>

                {summary ? (
                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chief Complaint</p>
                      <p className="mt-1 text-sm text-slate-800">{summary.chiefComplaint || 'Not captured'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Symptoms</p>
                      <p className="mt-1 text-sm text-slate-800">{summary.symptoms?.join(', ') || 'Not captured'}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Medical History</p>
                      <p className="mt-1 text-sm text-slate-800">{summary.medicalHistory?.join(', ') || 'None reported'}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <PanelTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

              {activeTab === 'vitals' && (
                <div className="ui-surface ui-surface-hover p-5">
                  <h3 className="mb-4 text-lg font-semibold text-slate-900">Record Vitals</h3>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    {[
                      ['bloodPressureSystolic', 'Systolic BP (mmHg)'],
                      ['bloodPressureDiastolic', 'Diastolic BP (mmHg)'],
                      ['heartRate', 'Heart Rate (bpm)'],
                      ['temperatureFahrenheit', 'Temperature (°F)'],
                      ['oxygenSaturation', 'SpO2 (%)'],
                      ['respiratoryRate', 'Respiratory Rate'],
                      ['weightKg', 'Weight (kg)'],
                      ['heightCm', 'Height (cm)'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
                        <input
                          type="number"
                          value={(vitals as any)[key]}
                          onChange={(e) => setVitals((prev) => ({ ...prev, [key]: e.target.value }))}
                          className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm transition-all hover:border-cyan-300"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Clinical Note</label>
                    <textarea
                      value={vitals.notes}
                      onChange={(e) => setVitals((prev) => ({ ...prev, notes: e.target.value }))}
                      rows={3}
                      className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm transition-all hover:border-cyan-300"
                      placeholder="Enter observations or context for the doctor"
                    />
                  </div>

                  <div className="mt-5 flex flex-wrap justify-end gap-2">
                    <AnimatedButton
                      variant="secondary"
                      onClick={() => addVitalsMutation.mutate()}
                      disabled={addVitalsMutation.isPending}
                    >
                      {addVitalsMutation.isPending ? 'Saving...' : 'Save Vitals'}
                    </AnimatedButton>
                    <AnimatedButton onClick={() => markReadyMutation.mutate()} disabled={markReadyMutation.isPending}>
                      {markReadyMutation.isPending ? 'Marking...' : 'Mark Ready for Doctor'}
                    </AnimatedButton>
                  </div>
                </div>
              )}

              {activeTab === 'history' && <PatientHistoryPanel patientId={selectedPatient.patient_id} token={token || ''} />}
            </div>
          )}
        </section>
      </div>
      )}
    </AppShell>
  );
}

export default function NurseDashboardPage() {
  return (
    <AuthGuard>
      <NurseDashboardContent />
    </AuthGuard>
  );
}
