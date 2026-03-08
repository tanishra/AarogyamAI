'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { RoleGuard, useAuth } from '@/lib/auth';
import { AIConsiderationsPanel } from '@/components/doctor/AIConsiderationsPanel';
import { ClinicalReasoningForm } from '@/components/doctor/ClinicalReasoningForm';
import { AnimatedButton, AppShell, EmptyState, PageHeader, Skeleton } from '@/components/common';

interface ContextPayload {
  patient?: { id: string; name: string; email: string };
  summary?: {
    chiefComplaint?: string;
    symptoms?: string[];
    medicalHistory?: string[];
    allergies?: string[];
    currentMedications?: string[];
  };
  vitals?: {
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    heartRate?: number;
    temperatureFahrenheit?: number;
    oxygenSaturation?: number;
    respiratoryRate?: number;
  };
  considerations?: any[];
  reasoning?: {
    id: string;
    differentialDiagnosis: string[];
    diagnosticPlan: string;
    reasoningRationale: string;
    finalNotes: string;
  };
}

function DoctorPatientReviewContent() {
  const { token, logout } = useAuth();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const patientId = params.id;
  const sessionId = searchParams.get('sessionId');

  const [reasoningId, setReasoningId] = useState<string | null>(null);
  const [reasoning, setReasoning] = useState({
    differentialDiagnosis: '',
    diagnosticPlan: '',
    reasoningRationale: '',
    finalNotes: '',
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['doctor-patient-review', patientId, sessionId],
    enabled: !!token && !!patientId && !!sessionId,
    queryFn: async () => {
      const response = await fetch(`/api/doctor/patient/${patientId}/context?sessionId=${sessionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to load patient context');
      const payload = await response.json();
      return (payload?.data || {}) as ContextPayload;
    },
  });

  const considerations = data?.considerations || [];

  const generateConsiderationsMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/doctor/patient/${patientId}/considerations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });
      if (!response.ok) throw new Error('Failed to generate considerations');
      return response.json();
    },
    onSuccess: async () => {
      await refetch();
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
      if (!response.ok) throw new Error('Failed to update consideration status');
      return response.json();
    },
    onSuccess: async () => {
      await refetch();
    },
  });

  const saveReasoningMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/doctor/patient/${patientId}/reasoning`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId,
          differentialDiagnosis: reasoning.differentialDiagnosis
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean),
          diagnosticPlan: reasoning.diagnosticPlan,
          reasoningRationale: reasoning.reasoningRationale,
          finalNotes: reasoning.finalNotes,
        }),
      });
      if (!response.ok) throw new Error('Failed to save reasoning');
      return response.json();
    },
    onSuccess: async (payload) => {
      const nextReasoningId = payload?.data?.reasoningId as string | undefined;
      if (nextReasoningId) setReasoningId(nextReasoningId);
      await refetch();
    },
  });

  const approveReasoningMutation = useMutation({
    mutationFn: async () => {
      const id = reasoningId || data?.reasoning?.id;
      if (!id) throw new Error('Save reasoning first');
      const response = await fetch(`/api/doctor/reasoning/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to approve reasoning');
      return response.json();
    },
  });

  if (!sessionId) {
    return (
      <AppShell tone="doctor">
        <EmptyState
          title="Missing session ID"
          description="Open this page from the doctor queue with a valid session context."
        />
      </AppShell>
    );
  }

  const summary = data?.summary;
  const vitals = data?.vitals;

  return (
    <AppShell tone="doctor">
      <PageHeader
        title="Doctor Patient Review"
        subtitle="Unified context with physician-in-control AI decision support"
        badge="Doctor"
        actions={
          <div className="flex items-center gap-2">
            <Link href="/doctor/dashboard">
              <AnimatedButton variant="secondary">Back to Dashboard</AnimatedButton>
            </Link>
            <AnimatedButton variant="secondary" onClick={logout}>Logout</AnimatedButton>
          </div>
        }
      />

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-indigo-200/70 bg-gradient-to-r from-[#eef2ff] via-[#f7f9ff] to-[#ecfffb] p-5 animate-fade-up">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-indigo-200/40 blur-3xl" />
        <h2 className="text-lg font-semibold text-slate-900">Unified patient context and AI-assisted review</h2>
        <p className="mt-1 text-sm text-slate-600">
          Validate symptoms and vitals, adjudicate AI suggestions, and finalize the clinical reasoning trace.
        </p>
      </section>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          <section className="ui-surface ui-surface-hover p-5 animate-fade-up">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{data?.patient?.name || 'Patient review'}</h2>
                <p className="mt-1 text-sm text-slate-500">{data?.patient?.email || ''}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Session: {sessionId}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chief Complaint</p>
                <p className="mt-1 text-sm text-slate-800">{summary?.chiefComplaint || 'Not captured'}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Symptoms</p>
                <p className="mt-1 text-sm text-slate-800">{summary?.symptoms?.join(', ') || 'Not captured'}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Allergies</p>
                <p className="mt-1 text-sm text-amber-800">{summary?.allergies?.join(', ') || 'No known allergies'}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nurse Vitals</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-3 lg:grid-cols-6">
                <p>BP: <span className="font-semibold">{vitals?.bloodPressureSystolic || '-'} / {vitals?.bloodPressureDiastolic || '-'}</span></p>
                <p>HR: <span className="font-semibold">{vitals?.heartRate || '-'}</span></p>
                <p>Temp: <span className="font-semibold">{vitals?.temperatureFahrenheit || '-'}</span></p>
                <p>SpO2: <span className="font-semibold">{vitals?.oxygenSaturation || '-'}</span></p>
                <p>RR: <span className="font-semibold">{vitals?.respiratoryRate || '-'}</span></p>
              </div>
            </div>
          </section>

          <section className="animate-fade-up delay-1">
            <AIConsiderationsPanel
              considerations={considerations}
              isGenerating={generateConsiderationsMutation.isPending}
              onGenerate={() => generateConsiderationsMutation.mutate()}
              onUpdateStatus={(considerationId, status) => {
                updateConsiderationMutation.mutate({ considerationId, status });
              }}
            />
          </section>

          <section className="animate-fade-up delay-2">
            <ClinicalReasoningForm
              reasoning={{
                differentialDiagnosis: reasoning.differentialDiagnosis || data?.reasoning?.differentialDiagnosis?.join('\n') || '',
                diagnosticPlan: reasoning.diagnosticPlan || data?.reasoning?.diagnosticPlan || '',
                reasoningRationale: reasoning.reasoningRationale || data?.reasoning?.reasoningRationale || '',
                finalNotes: reasoning.finalNotes || data?.reasoning?.finalNotes || '',
              }}
              onChange={(field, value) => setReasoning((prev) => ({ ...prev, [field]: value }))}
              onSave={() => saveReasoningMutation.mutate()}
              onApprove={() => approveReasoningMutation.mutate()}
              isSaving={saveReasoningMutation.isPending}
              isApproving={approveReasoningMutation.isPending}
              reasoningId={reasoningId || data?.reasoning?.id || null}
            />
          </section>

          {(generateConsiderationsMutation.error || updateConsiderationMutation.error || saveReasoningMutation.error || approveReasoningMutation.error) ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {(
                generateConsiderationsMutation.error ||
                updateConsiderationMutation.error ||
                saveReasoningMutation.error ||
                approveReasoningMutation.error
              ) as Error
                ? ((
                    generateConsiderationsMutation.error ||
                    updateConsiderationMutation.error ||
                    saveReasoningMutation.error ||
                    approveReasoningMutation.error
                  ) as Error).message
                : 'Something went wrong'}
            </p>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

export default function DoctorPatientReviewPage() {
  return (
    <RoleGuard allowedRoles={['Doctor', 'Administrator']}>
      <DoctorPatientReviewContent />
    </RoleGuard>
  );
}
