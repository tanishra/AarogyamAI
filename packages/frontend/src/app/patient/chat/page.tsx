'use client';

import Link from 'next/link';
import { RoleGuard, useAuth } from '@/lib/auth';
import { AnimatedButton, AppShell, PageHeader } from '@/components/common';
import { PatientChat } from '@/components/patient/PatientChat';

function PatientChatContent() {
  const { logout } = useAuth();

  return (
    <AppShell tone="patient">
      <PageHeader
        title="AI Nurse Intake"
        subtitle="Conversational pre-consultation workflow with adaptive symptom capture"
        badge="Live Session"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/patient/dashboard">
              <AnimatedButton variant="secondary">Dashboard</AnimatedButton>
            </Link>
            <AnimatedButton variant="secondary" onClick={logout}>
              Logout
            </AnimatedButton>
          </div>
        }
      />
      <PatientChat />
    </AppShell>
  );
}

export default function PatientChatPage() {
  return (
    <RoleGuard allowedRoles={['Patient']}>
      <PatientChatContent />
    </RoleGuard>
  );
}
