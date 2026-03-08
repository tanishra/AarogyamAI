'use client';

import { useState } from 'react';
import { AuthGuard } from '@/lib/auth/AuthGuard';
import { RoleGuard } from '@/lib/auth/RoleGuard';
import { Navigation } from '@/components/Navigation';
import { AppShell, PageHeader, PanelTabs } from '@/components/common';
import AuditLogSearch from '@/components/audit/AuditLogSearch';
import AuditLogTable from '@/components/audit/AuditLogTable';
import AccessPatternViewer from '@/components/audit/AccessPatternViewer';
import AnomalyAlertList from '@/components/audit/AnomalyAlertList';
import LogVerification from '@/components/audit/LogVerification';

type TabType = 'logs' | 'patterns' | 'anomalies' | 'verification';

function AuditPage() {
  const [activeTab, setActiveTab] = useState<TabType>('logs');

  const tabs = [
    { id: 'logs' as TabType, label: 'Audit Logs' },
    { id: 'patterns' as TabType, label: 'Access Patterns' },
    { id: 'anomalies' as TabType, label: 'Anomaly Alerts' },
    { id: 'verification' as TabType, label: 'Log Verification' },
  ];

  return (
    <>
      <Navigation />
      <AppShell>
        <div className="mb-6 overflow-hidden rounded-[22px] border border-rose-300/45 bg-gradient-to-r from-rose-700 via-orange-700 to-amber-600 px-6 py-6 text-white shadow-2xl shadow-rose-900/30">
          <p className="ui-chip border-white/30 bg-white/10 text-rose-100">Security Operations</p>
          <h1 className="mt-3 text-3xl font-bold">Audit Center</h1>
          <p className="mt-1 text-sm text-rose-100/90">Trace system behavior, detect anomalies, and verify log integrity</p>
        </div>

        <div className="ui-surface mb-5 border-orange-200/70 bg-gradient-to-r from-orange-50 to-amber-50 p-3">
          <PanelTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />
        </div>

        <div className="space-y-5 animate-fade-up">
          {activeTab === 'logs' && (
            <>
              <div className="ui-surface border-rose-200/80 bg-gradient-to-br from-rose-50 to-white p-5">
                <AuditLogSearch />
              </div>
              <div className="ui-surface border-orange-200/80 bg-gradient-to-br from-orange-50 to-white p-5">
                <AuditLogTable />
              </div>
            </>
          )}
          {activeTab === 'patterns' && <div className="ui-surface border-cyan-200/80 bg-gradient-to-br from-cyan-50 to-white p-5"><AccessPatternViewer /></div>}
          {activeTab === 'anomalies' && <div className="ui-surface border-amber-200/80 bg-gradient-to-br from-amber-50 to-white p-5"><AnomalyAlertList /></div>}
          {activeTab === 'verification' && <div className="ui-surface border-emerald-200/80 bg-gradient-to-br from-emerald-50 to-white p-5"><LogVerification /></div>}
        </div>
      </AppShell>
    </>
  );
}

export default function AuditPageWithAuth() {
  return (
    <AuthGuard>
      <RoleGuard allowedRoles={['Administrator', 'DPO']}>
        <AuditPage />
      </RoleGuard>
    </AuthGuard>
  );
}
