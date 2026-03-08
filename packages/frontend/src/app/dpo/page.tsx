'use client';

import { useState } from 'react';
import { AuthGuard } from '@/lib/auth/AuthGuard';
import { RoleGuard } from '@/lib/auth/RoleGuard';
import { AppShell, PageHeader, PanelTabs } from '@/components/common';
import { Navigation } from '@/components/Navigation';
import ConsentRecordList from '@/components/consent/ConsentRecordList';
import ConsentWithdrawalQueue from '@/components/consent/ConsentWithdrawalQueue';
import GrievanceQueue from '@/components/grievance/GrievanceQueue';
import DataAccessRequestList from '@/components/consent/DataAccessRequestList';
import ComplianceReportGenerator from '@/components/compliance/ComplianceReportGenerator';

type TabType = 'consent' | 'withdrawals' | 'grievances' | 'data-requests' | 'reports';

function DPOPage() {
  const [activeTab, setActiveTab] = useState<TabType>('consent');

  const tabs = [
    { id: 'consent' as TabType, label: 'Consent Records' },
    { id: 'withdrawals' as TabType, label: 'Withdrawals' },
    { id: 'grievances' as TabType, label: 'Grievances' },
    { id: 'data-requests' as TabType, label: 'Data Requests' },
    { id: 'reports' as TabType, label: 'Reports' },
  ];

  return (
    <>
      <Navigation />
      <AppShell>
        <PageHeader
          title="DPO Operations"
          subtitle="Consent governance, grievance handling, and compliance reporting"
          badge="DPO"
        />

        <section className="relative mb-5 overflow-hidden rounded-3xl border border-emerald-200/70 bg-gradient-to-r from-[#e9fff6] via-[#f6fffb] to-[#eef8ff] p-5 animate-fade-up">
          <div className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-emerald-200/45 blur-3xl" />
          <h2 className="text-xl font-semibold text-slate-900">Compliance control center</h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage consent lifecycle, resolve grievances, and generate compliance-ready reports.
          </p>
        </section>

        <div className="ui-surface mb-5 p-3">
          <PanelTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />
        </div>

        <div className="ui-surface ui-surface-hover p-5 animate-fade-up">
          {activeTab === 'consent' && <ConsentRecordList />}
          {activeTab === 'withdrawals' && <ConsentWithdrawalQueue />}
          {activeTab === 'grievances' && <GrievanceQueue />}
          {activeTab === 'data-requests' && <DataAccessRequestList />}
          {activeTab === 'reports' && <ComplianceReportGenerator />}
        </div>
      </AppShell>
    </>
  );
}

export default function DPOPageWithAuth() {
  return (
    <AuthGuard>
      <RoleGuard allowedRoles={['DPO']}>
        <DPOPage />
      </RoleGuard>
    </AuthGuard>
  );
}
