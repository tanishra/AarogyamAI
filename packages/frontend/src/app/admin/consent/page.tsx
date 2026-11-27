'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigation } from '@/components/Navigation';
import { AppShell, PanelTabs, AnimatedButton, EmptyState } from '@/components/common';
import { useI18n } from '@/lib/i18n';

type Tab = 'consent' | 'grievances';

interface ConsentRecord {
  id: string;
  consent_type: string;
  status: string;
  patient_id: string;
  granted_at: string;
  data_categories: string[];
}

interface Grievance {
  id: string;
  status: 'pending' | 'investigating' | 'resolved' | 'escalated';
  description: string;
  patient_id: string;
  submitted_at: string;
  dpo_notes?: string;
}

export default function ConsentGrievancePage() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<Tab>('consent');
  const [selectedGrievance, setSelectedGrievance] = useState<Grievance | null>(null);
  const [dpoNotes, setDpoNotes] = useState('');
  const queryClient = useQueryClient();

  const { data: consents = [], isLoading: consentsLoading } = useQuery({
    queryKey: ['consent-records-admin'],
    queryFn: async () => {
      const response = await fetch('/api/consent/records', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch consents');
      const result = await response.json();
      return result.data as ConsentRecord[];
    },
    enabled: activeTab === 'consent',
  });

  const { data: grievances = [], isLoading: grievancesLoading } = useQuery({
    queryKey: ['grievances-admin'],
    queryFn: async () => {
      const response = await fetch('/api/grievances', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch grievances');
      const result = await response.json();
      return result.data as Grievance[];
    },
    enabled: activeTab === 'grievances',
  });

  const updateGrievanceMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: Grievance['status']; notes: string }) => {
      const response = await fetch(`/api/grievances/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ status, dpoNotes: notes }),
      });
      if (!response.ok) throw new Error('Failed to update grievance');
      return response.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['grievances-admin'] });
      setSelectedGrievance(null);
      setDpoNotes('');
    },
  });

  const statusBadge = (status: string) => {
    if (status === 'active' || status === 'resolved') return 'bg-emerald-100 text-emerald-700';
    if (status === 'withdrawn' || status === 'expired' || status === 'escalated') return 'bg-rose-100 text-rose-700';
    if (status === 'investigating') return 'bg-sky-100 text-sky-700';
    return 'bg-amber-100 text-amber-700';
  };

  return (
    <>
      <Navigation />
      <AppShell>
        <div className="mb-6 overflow-hidden rounded-[22px] border border-teal-300/45 bg-gradient-to-r from-teal-700 via-cyan-700 to-blue-700 px-6 py-6 text-white shadow-2xl shadow-cyan-900/30">
          <p className="ui-chip border-white/30 bg-white/10 text-cyan-100">{t('admin.complianceOps')}</p>
          <h1 className="mt-3 text-3xl font-bold">{t('admin.consentGrievance')}</h1>
          <p className="mt-1 text-sm text-cyan-100/90">{t('admin.complianceWorkspace')}</p>
        </div>

        <div className="ui-surface mb-5 border-cyan-200/70 bg-gradient-to-r from-cyan-50 to-teal-50 p-3">
          <PanelTabs
            tabs={[
              { id: 'consent' as Tab, label: t('admin.consentRecords') },
              { id: 'grievances' as Tab, label: t('admin.grievances') },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />
        </div>

        {activeTab === 'consent' ? (
          <div className="ui-surface overflow-hidden p-0">
            {consentsLoading ? (
              <div className="p-8 text-center text-sm text-slate-600">{t('admin.loadingConsents')}</div>
            ) : consents.length === 0 ? (
              <div className="p-6"><EmptyState title={t('admin.noConsents')} description={t('admin.consentsAppear')} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">{t('queue.patient')}</th>
                      <th className="px-4 py-3 text-left">{t('admin.consentType')}</th>
                      <th className="px-4 py-3 text-left">{t('admin.granted')}</th>
                      <th className="px-4 py-3 text-left">{t('common.status')}</th>
                      <th className="px-4 py-3 text-left">{t('admin.dataCategories')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {consents.map((consent) => (
                      <tr key={consent.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{consent.patient_id.slice(0, 8)}...</td>
                        <td className="px-4 py-3">{consent.consent_type}</td>
                        <td className="px-4 py-3">{new Date(consent.granted_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusBadge(consent.status)}`}>{consent.status}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {(consent.data_categories || []).map((category) => (
                              <span key={category} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">{category}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          <div className="ui-surface overflow-hidden p-0">
            {grievancesLoading ? (
              <div className="p-8 text-center text-sm text-slate-600">{t('admin.loadingGrievances')}</div>
            ) : grievances.length === 0 ? (
              <div className="p-6"><EmptyState title={t('admin.noGrievances')} description={t('admin.noGrievancesDesc')} /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">{t('queue.patient')}</th>
                      <th className="px-4 py-3 text-left">{t('admin.submitted')}</th>
                      <th className="px-4 py-3 text-left">{t('common.status')}</th>
                      <th className="px-4 py-3 text-left">{t('common.description')}</th>
                      <th className="px-4 py-3 text-left">{t('admin.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {grievances.map((grievance) => (
                      <tr key={grievance.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-medium text-slate-900">{grievance.patient_id.slice(0, 8)}...</td>
                        <td className="px-4 py-3">{new Date(grievance.submitted_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusBadge(grievance.status)}`}>{grievance.status}</span></td>
                        <td className="px-4 py-3 max-w-lg truncate">{grievance.description}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => { setSelectedGrievance(grievance); setDpoNotes(grievance.dpo_notes || ''); }} className="font-medium text-blue-600 hover:text-blue-700">{t('admin.manage')}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {selectedGrievance ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="ui-surface w-full max-w-xl p-5">
              <h2 className="text-lg font-bold text-slate-900">{t('admin.manageGrievance')}</h2>
              <p className="mt-2 text-sm text-slate-600">{selectedGrievance.description}</p>
              <select
                value={selectedGrievance.status}
                onChange={(e) => setSelectedGrievance({ ...selectedGrievance, status: e.target.value as Grievance['status'] })}
                className="ui-focus-ring mt-4 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="pending">{t('admin.statusPending')}</option>
                <option value="investigating">{t('admin.statusInvestigating')}</option>
                <option value="resolved">{t('admin.statusResolved')}</option>
                <option value="escalated">{t('admin.statusEscalated')}</option>
              </select>
              <textarea value={dpoNotes} onChange={(e) => setDpoNotes(e.target.value)} rows={4} className="ui-focus-ring mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" placeholder={t('admin.dpoNotes')} />
              <div className="mt-4 flex justify-end gap-2">
                <AnimatedButton variant="secondary" onClick={() => setSelectedGrievance(null)}>{t('common.cancel')}</AnimatedButton>
                <AnimatedButton
                  onClick={() => updateGrievanceMutation.mutate({ id: selectedGrievance.id, status: selectedGrievance.status, notes: dpoNotes })}
                  disabled={updateGrievanceMutation.isPending}
                >
                  {updateGrievanceMutation.isPending ? t('common.saving') : t('common.save')}
                </AnimatedButton>
              </div>
            </div>
          </div>
        ) : null}
      </AppShell>
    </>
  );
}
