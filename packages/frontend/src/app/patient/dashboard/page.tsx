'use client';

import { useMemo, useState } from 'react';
import { AuthGuard, useAuth } from '@/lib/auth';
import { PatientChat } from '@/components/patient/PatientChat';
import { MedicalHistory } from '@/components/patient/MedicalHistory';
import { PatientProfile } from '@/components/patient/PatientProfile';
import { AppShell, PanelTabs, PageHeader, AnimatedButton } from '@/components/common';

type TabId = 'chat' | 'history' | 'profile';

function PatientDashboardContent() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('chat');

  const tabs = useMemo(
    () => [
      { id: 'chat' as TabId, label: 'AI Nurse Intake' },
      { id: 'history' as TabId, label: 'Consultation History' },
      { id: 'profile' as TabId, label: 'My Profile' },
    ],
    []
  );

  return (
    <AppShell tone="patient">
      <PageHeader
        title="Clinical Zen Patient Portal"
        subtitle="Secure pre-consultation intake and symptom capture"
        badge="Patient"
        actions={
          <div className="flex items-center gap-3">
            <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-right sm:block">
              <p className="text-xs text-slate-500">Signed in as</p>
              <p className="text-sm font-semibold text-slate-900">{user?.name || 'Patient'}</p>
            </div>
            <AnimatedButton variant="secondary" onClick={logout}>
              Logout
            </AnimatedButton>
          </div>
        }
      />

      <div className="relative mb-6 overflow-hidden rounded-3xl border border-blue-200/70 bg-gradient-to-r from-[#e9f4ff] via-[#f4fbff] to-[#e8fffa] p-6 shadow-sm animate-fade-up">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-cyan-200/50 blur-2xl" />
        <h2 className="text-2xl font-semibold text-slate-900">Your pre-consultation workspace</h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-600">
          Complete intake, keep your medical profile current, and help the care team review your case faster.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Secure by default', 'AI-assisted intake', 'Faster nurse handoff'].map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-blue-200 bg-white/85 px-3 py-1 text-xs font-semibold text-blue-700 transition-transform hover:scale-105"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="ui-surface ui-surface-hover p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Security</p>
          <p className="mt-2 text-sm text-slate-700">End-to-end encrypted session with role-based access controls.</p>
        </div>
        <div className="ui-surface ui-surface-hover p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assistant</p>
          <p className="mt-2 text-sm text-slate-700">AI nurse captures symptoms and prepares structured context for care team.</p>
        </div>
        <div className="ui-surface ui-surface-hover p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Session Goal</p>
          <p className="mt-2 text-sm text-slate-700">Complete intake in 5-10 minutes for faster clinical review.</p>
        </div>
      </div>

      <PanelTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />

      {activeTab === 'chat' && <PatientChat />}
      {activeTab === 'history' && <MedicalHistory />}
      {activeTab === 'profile' && <PatientProfile />}
    </AppShell>
  );
}

export default function PatientDashboardPage() {
  return (
    <AuthGuard>
      <PatientDashboardContent />
    </AuthGuard>
  );
}
