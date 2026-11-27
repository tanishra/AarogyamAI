'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConsentAPI } from '@/lib/api/services/consent';
import { useI18n } from '@/lib/i18n';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { Grievance } from '@/lib/api/types';

export default function GrievanceQueue() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState<Grievance['status']>('pending');
  const [dpoNotes, setDpoNotes] = useState('');
  const queryClient = useQueryClient();

  // Fetch grievances
  const { data: grievances = [], isLoading, error } = useQuery({
    queryKey: ['grievances', statusFilter],
    queryFn: () =>
      ConsentAPI.getGrievances(
        statusFilter !== 'all' ? (statusFilter as Grievance['status']) : undefined
      ),
    refetchInterval: 30000,
  });

  // Update grievance mutation
  const updateGrievance = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: Grievance['status']; notes?: string }) =>
      ConsentAPI.updateGrievance(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grievances'] });
      setEditingId(null);
      setDpoNotes('');
    },
  });

  const handleUpdate = (id: string) => {
    updateGrievance.mutate({ id, status: newStatus, notes: dpoNotes });
  };

  const startEditing = (grievance: Grievance) => {
    setEditingId(grievance.id);
    setNewStatus(grievance.status);
    setDpoNotes(grievance.dpoNotes || '');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'investigating':
        return 'bg-blue-100 text-blue-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'escalated':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">{t('grievance.loadError')}</h3>
          <p className="text-red-600 mt-2">
            {error instanceof Error ? error.message : t('grievance.loadFailed')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('grievance.management')}</h3>

        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">{t('common.filterByStatus')}</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">{t('common.allStatuses')}</option>
            <option value="pending">{t('admin.statusPending')}</option>
            <option value="investigating">{t('admin.statusInvestigating')}</option>
            <option value="resolved">{t('admin.statusResolved')}</option>
            <option value="escalated">{t('admin.statusEscalated')}</option>
          </select>
          <span className="text-sm text-gray-600">
            {t('grievance.found', { count: grievances.length, plural: grievances.length !== 1 ? 's' : '' })}
          </span>
        </div>
      </div>

      {/* Success Message */}
      {updateGrievance.isSuccess && (
        <div role="status" aria-live="polite" className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">
            {t('grievance.updateSuccess')}
          </p>
        </div>
      )}

      {/* Grievances Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('queue.patient')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.submissionDate')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.description')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {grievances.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    {t('grievance.noFound')}
                  </td>
                </tr>
              ) : (
                grievances.map((grievance) => (
                  <>
                    <tr key={grievance.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {grievance.patientName}
                        </div>
                        <div className="text-sm text-gray-500">{grievance.patientId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(grievance.submittedAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            grievance.status
                          )}`}
                        >
                          {grievance.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {grievance.description}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() =>
                            setExpandedRow(expandedRow === grievance.id ? null : grievance.id)
                          }
                          aria-expanded={expandedRow === grievance.id}
                          aria-controls={`grievance-details-${grievance.id}`}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          {expandedRow === grievance.id ? t('common.hideDetails') : t('admin.viewDetails')}
                        </button>
                      </td>
                    </tr>

                    {/* Expanded Row */}
                    {expandedRow === grievance.id && (
                      <tr id={`grievance-details-${grievance.id}`}>
                        <td colSpan={5} className="px-6 py-4 bg-gray-50">
                          <div className="space-y-4">
                            {/* Full Description */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                {t('grievance.fullDescription')}
                              </h4>
                              <p className="text-sm text-gray-900">{grievance.description}</p>
                            </div>

                            {/* Affected Data */}
                            <div>
                              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                {t('grievance.affectedData')}
                              </h4>
                              <p className="text-sm text-gray-900">{grievance.affectedData}</p>
                            </div>

                            {/* Resolution Timeline */}
                            {grievance.resolutionTimeline && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                  {t('grievance.resolutionTimeline')}
                                </h4>
                                <p className="text-sm text-gray-900">
                                  {grievance.resolutionTimeline}
                                </p>
                              </div>
                            )}

                            {/* DPO Notes */}
                            {grievance.dpoNotes && (
                              <div>
                                <h4 className="text-sm font-semibold text-gray-700 mb-2">
                                  {t('admin.dpoNotes')}
                                </h4>
                                <p className="text-sm text-gray-900">{grievance.dpoNotes}</p>
                              </div>
                            )}

                            {/* Update Form */}
                            {editingId === grievance.id ? (
                              <div className="border-t pt-4 space-y-4">
                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {t('grievance.updateStatus')}
                                  </label>
                                  <select
                                    value={newStatus}
                                    onChange={(e) =>
                                      setNewStatus(e.target.value as Grievance['status'])
                                    }
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                  >
                                    <option value="pending">{t('admin.statusPending')}</option>
                                    <option value="investigating">{t('admin.statusInvestigating')}</option>
                                    <option value="resolved">{t('admin.statusResolved')}</option>
                                    <option value="escalated">{t('admin.statusEscalated')}</option>
                                  </select>
                                </div>

                                <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">
                                    {t('admin.dpoNotes')}
                                  </label>
                                  <textarea
                                    value={dpoNotes}
                                    onChange={(e) => setDpoNotes(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                    placeholder={t('grievance.notesPlaceholder')}
                                  />
                                </div>

                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleUpdate(grievance.id)}
                                    disabled={updateGrievance.isPending}
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                                  >
                                    {updateGrievance.isPending ? t('common.saving') : t('profile.saveChanges')}
                                  </button>
                                  <button
                                    onClick={() => setEditingId(null)}
                                    disabled={updateGrievance.isPending}
                                    className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
                                  >
                                    {t('common.cancel')}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditing(grievance)}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                              >
                                {t('grievance.updateStatus')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
