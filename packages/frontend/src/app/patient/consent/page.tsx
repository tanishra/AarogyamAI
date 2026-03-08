'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RoleGuard, useAuth } from '@/lib/auth';
import { AnimatedButton, AppShell, EmptyState, PageHeader, Skeleton, StatTile } from '@/components/common';

interface ConsentRecord {
  id: string;
  consent_type: string;
  status: 'active' | 'withdrawn' | 'expired';
  data_categories: string[];
  processing_purposes: string[];
  granted_at: string;
  expires_at?: string | null;
  withdrawn_at?: string | null;
}

function PatientConsentContent() {
  const { token, logout } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['patient-consent'],
    enabled: !!token,
    queryFn: async () => {
      const response = await fetch('/api/patient/consent', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to load consent records');
      }

      const payload = await response.json();
      return (payload?.data || []) as ConsentRecord[];
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (consentId: string) => {
      const response = await fetch('/api/patient/consent/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ consentId }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err?.message || 'Unable to withdraw consent');
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient-consent'] });
    },
  });

  const records = data || [];
  const activeCount = useMemo(() => records.filter((item) => item.status === 'active').length, [records]);
  const pendingAction = withdrawMutation.isPending ? 1 : 0;

  const statusStyles: Record<ConsentRecord['status'], string> = {
    active: 'bg-emerald-100 text-emerald-700',
    withdrawn: 'bg-rose-100 text-rose-700',
    expired: 'bg-amber-100 text-amber-700',
  };

  return (
    <AppShell tone="patient">
      <PageHeader
        title="Consent Management"
        subtitle="Manage permissions for clinical data processing and AI-assisted workflows"
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

      <section className="relative mb-5 overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-r from-[#e8fff5] via-[#f5fffb] to-[#eef8ff] p-5 animate-fade-up">
        <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-emerald-200/45 blur-3xl" />
        <h2 className="text-lg font-semibold text-slate-900">Transparent control over your data permissions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Review what is active, withdraw specific consents, and keep an auditable record of data access preferences.
        </p>
      </section>

      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Total Records" value={records.length} trend="Tracked permissions" />
        <StatTile label="Active" value={activeCount} trend="Currently valid" tone={activeCount > 0 ? 'success' : 'default'} />
        <StatTile label="Actions in Progress" value={pendingAction} trend="Withdrawal requests" />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : records.length === 0 ? (
        <EmptyState title="No consent records" description="Your consent records will appear here once created by onboarding workflows." />
      ) : (
        <div className="space-y-4">
          {records.map((record, index) => (
            <article
              key={record.id}
              className="ui-surface ui-surface-hover p-5 animate-fade-up"
              style={{ animationDelay: `${Math.min(index * 70, 280)}ms` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{record.consent_type}</h2>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${statusStyles[record.status]}`}>
                      {record.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Granted {new Date(record.granted_at).toLocaleString()}
                    {record.expires_at ? ` • Expires ${new Date(record.expires_at).toLocaleDateString()}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <AnimatedButton variant="secondary" onClick={() => window.print()}>
                    Download
                  </AnimatedButton>
                  <AnimatedButton
                    onClick={() => withdrawMutation.mutate(record.id)}
                    disabled={record.status !== 'active' || withdrawMutation.isPending}
                  >
                    {withdrawMutation.isPending ? 'Submitting...' : 'Withdraw'}
                  </AnimatedButton>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Data Categories</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(record.data_categories || []).map((category) => (
                      <span
                        key={category}
                        className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 transition-transform hover:scale-105"
                      >
                        {category}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Processing Purposes</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(record.processing_purposes || []).map((purpose) => (
                      <span
                        key={purpose}
                        className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-medium text-violet-700 transition-transform hover:scale-105"
                      >
                        {purpose}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {record.withdrawn_at ? (
                <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  Withdrawn on {new Date(record.withdrawn_at).toLocaleString()}
                </p>
              ) : null}
            </article>
          ))}

          {withdrawMutation.error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {(withdrawMutation.error as Error).message}
            </p>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}

export default function PatientConsentPage() {
  return (
    <RoleGuard allowedRoles={['Patient']}>
      <PatientConsentContent />
    </RoleGuard>
  );
}
