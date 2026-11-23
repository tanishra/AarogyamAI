'use client';

import Link from 'next/link';
import { RoleGuard, useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { AnimatedButton, AppShell, PageHeader } from '@/components/common';
import { PatientChat } from '@/components/patient/PatientChat';

function PatientChatContent() {
  const { logout } = useAuth();
  const { t } = useI18n();

  return (
    <AppShell tone="patient">
      <PageHeader
        title="AI Nurse Intake"
        subtitle="Conversational pre-consultation workflow with adaptive symptom capture"
        badge="Live Session"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/patient/dashboard">
              <AnimatedButton variant="secondary">{t('nav.dashboard')}</AnimatedButton>
            </Link>
            <AnimatedButton variant="secondary" onClick={logout}>
              {t('nav.logout')}
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
