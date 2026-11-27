'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConsentAPI } from '@/lib/api/services/consent';
import { useI18n } from '@/lib/i18n';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { DataAccessRequest } from '@/lib/api/types';

export default function DataAccessRequestList() {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fulfillingId, setFulfillingId] = useState<string | null>(null);
  const [responseUrl, setResponseUrl] = useState('');
  const queryClient = useQueryClient();

  // Fetch data access requests
  const { data: requests = [], isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['data-access-requests', statusFilter],
    queryFn: () =>
      ConsentAPI.getDataAccessRequests(
        statusFilter !== 'all' ? (statusFilter as DataAccessRequest['status']) : undefined
      ),
    refetchInterval: 30000,
  });

  // Fulfill request mutation
  const fulfillRequest = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      ConsentAPI.fulfillDataAccessRequest(id, url),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-access-requests'] });
      setFulfillingId(null);
      setResponseUrl('');
    },
  });

  const handleFulfill = (id: string) => {
    if (!responseUrl.trim()) {
      alert(t('consent.enterResponseUrl'));
      return;
    }
    fulfillRequest.mutate({ id, url: responseUrl });
  };

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'data_copy':
        return t('consent.typeDataCopy');
      case 'data_correction':
        return t('consent.typeDataCorrection');
      case 'data_deletion':
        return t('consent.typeDataDeletion');
      default:
        return type;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'fulfilled':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Uses the query's last-fetch timestamp rather than Date.now() so render
  // stays pure; requests refetch every 30s, keeping the check fresh.
  const isOverdue = (submittedAt: string) => {
    const hoursSinceSubmission =
      (dataUpdatedAt - new Date(submittedAt).getTime()) / (1000 * 60 * 60);
    return hoursSinceSubmission > 72;
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
          <h3 className="text-red-800 font-semibold">{t('consent.accessLoadError')}</h3>
          <p className="text-red-600 mt-2">
            {error instanceof Error ? error.message : t('consent.accessLoadFailed')}
          </p>
        </div>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending');
  const overdueRequests = pendingRequests.filter((r) => isOverdue(r.submittedAt));

  return (
    <div className="space-y-6">
      {/* Header with Warning */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('consent.accessRequests')}</h3>

        <div className="flex items-center gap-4 mb-4">
          <label className="text-sm font-medium text-gray-700">{t('common.filterByStatus')}</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">{t('common.allStatuses')}</option>
            <option value="pending">{t('admin.statusPending')}</option>
            <option value="fulfilled">{t('consent.fulfilled')}</option>
          </select>
          <span className="text-sm text-gray-600">
            {t('consent.requestsFound', { count: requests.length, plural: requests.length !== 1 ? 's' : '' })}
          </span>
        </div>

        {/* Overdue Warning */}
        {overdueRequests.length > 0 && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800 font-medium">
              {t('consent.overdueWarn', { count: overdueRequests.length, plural: overdueRequests.length !== 1 ? 's' : '' })}
            </p>
          </div>
        )}
      </div>

      {/* Success Message */}
      {fulfillRequest.isSuccess && (
        <div role="status" aria-live="polite" className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">
            {t('consent.fulfillSuccess')}
          </p>
        </div>
      )}

      {/* Requests Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('queue.patient')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('consent.requestType')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('consent.scope')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.submissionDate')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    {t('consent.noAccessRequests')}
                  </td>
                </tr>
              ) : (
                requests.map((request) => {
                  const overdue = request.status === 'pending' && isOverdue(request.submittedAt);

                  return (
                    <tr
                      key={request.id}
                      className={`hover:bg-gray-50 ${overdue ? 'bg-red-50' : ''}`}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {request.patientName}
                        </div>
                        <div className="text-sm text-gray-500">{request.patientId}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {getRequestTypeLabel(request.requestType)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                        {request.requestedScope}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(request.submittedAt).toLocaleDateString()}
                        </div>
                        {overdue && (
                          <div className="text-xs text-red-600 font-medium">{t('consent.overdue')}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            request.status
                          )}`}
                        >
                          {request.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        {request.status === 'pending' ? (
                          fulfillingId === request.id ? (
                            <div className="space-y-2">
                              <input
                                type="url"
                                value={responseUrl}
                                onChange={(e) => setResponseUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleFulfill(request.id)}
                                  disabled={fulfillRequest.isPending}
                                  className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-xs"
                                >
                                  {fulfillRequest.isPending ? t('common.saving') : t('common.submit')}
                                </button>
                                <button
                                  onClick={() => {
                                    setFulfillingId(null);
                                    setResponseUrl('');
                                  }}
                                  disabled={fulfillRequest.isPending}
                                  className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50 text-xs"
                                >
                                  {t('common.cancel')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setFulfillingId(request.id)}
                              className="text-green-600 hover:text-green-800 font-medium"
                            >
                              {t('consent.fulfillRequest')}
                            </button>
                          )
                        ) : (
                          <div className="text-sm text-gray-500">
                            <div>{t('consent.fulfilledAt', { date: new Date(request.fulfilledAt!).toLocaleDateString() })}</div>
                            {request.responseDocumentUrl && (
                              <a
                                href={request.responseDocumentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                {t('consent.viewDocument')}
                              </a>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
