'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ConsentAPI } from '@/lib/api/services/consent';
import { LoadingSpinner } from '@/components/LoadingSpinner';

export default function ConsentWithdrawalQueue() {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch withdrawal requests
  const { data: requests = [], isLoading, error } = useQuery({
    queryKey: ['consent-withdrawal-requests'],
    queryFn: () => ConsentAPI.getWithdrawalRequests(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Process withdrawal mutation
  const processWithdrawal = useMutation({
    mutationFn: (id: string) => ConsentAPI.processWithdrawal(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consent-withdrawal-requests'] });
      queryClient.invalidateQueries({ queryKey: ['consent-records'] });
      setShowConfirm(null);
      setProcessingId(null);
    },
  });

  const handleProcess = (id: string) => {
    setProcessingId(id);
    processWithdrawal.mutate(id);
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error Loading Withdrawal Requests</h3>
          <p className="text-red-600 mt-2">
            {error instanceof Error ? error.message : 'Failed to load withdrawal requests'}
          </p>
        </div>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900">Consent Withdrawal Queue</h3>
        <p className="text-sm text-gray-600 mt-1">
          {pendingRequests.length} pending request{pendingRequests.length !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Success Message */}
      {processWithdrawal.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-green-800 font-medium">
            ✓ Withdrawal request processed successfully
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
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Consent ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Request Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                    No pending withdrawal requests
                  </td>
                </tr>
              ) : (
                pendingRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {request.patientName}
                      </div>
                      <div className="text-sm text-gray-500">{request.patientId}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {request.consentId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(request.requestedAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {showConfirm === request.id ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleProcess(request.id)}
                            disabled={processingId === request.id}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                          >
                            {processingId === request.id ? 'Processing...' : 'Confirm'}
                          </button>
                          <button
                            onClick={() => setShowConfirm(null)}
                            disabled={processingId === request.id}
                            className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowConfirm(request.id)}
                          className="text-red-600 hover:text-red-800 font-medium"
                        >
                          Process Withdrawal
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Processed Requests */}
      {requests.filter((r) => r.status === 'processed').length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h4 className="text-md font-semibold text-gray-900 mb-4">Recently Processed</h4>
          <div className="space-y-2">
            {requests
              .filter((r) => r.status === 'processed')
              .slice(0, 5)
              .map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {request.patientName}
                    </p>
                    <p className="text-xs text-gray-500">
                      Processed {new Date(request.processedAt!).toLocaleString()}
                    </p>
                  </div>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                    Processed
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
