'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import type { RegistrationRequest } from '@/lib/api/types';

export function RegistrationQueue() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedRequest, setSelectedRequest] = useState<RegistrationRequest | null>(null);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // Fetch pending registration requests
  const { data: requests, isLoading, error } = useQuery({
    queryKey: ['registrationRequests'],
    queryFn: UserManagementAPI.getRegistrationRequests,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: (id: string) => UserManagementAPI.approveRegistration(id),
    onSuccess: () => {
      showToast('success', 'Registration request approved successfully');
      queryClient.invalidateQueries({ queryKey: ['registrationRequests'] });
      setSelectedRequest(null);
    },
    onError: (error: any) => {
      showToast('error', error.message || 'Failed to approve registration request');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      UserManagementAPI.rejectRegistration(id, reason),
    onSuccess: () => {
      showToast('success', 'Registration request rejected');
      queryClient.invalidateQueries({ queryKey: ['registrationRequests'] });
      setSelectedRequest(null);
      setShowRejectDialog(false);
      setRejectionReason('');
    },
    onError: (error: any) => {
      showToast('error', error.message || 'Failed to reject registration request');
    },
  });

  const handleApprove = (request: RegistrationRequest) => {
    if (window.confirm(`Approve registration for ${request.applicantName}?`)) {
      approveMutation.mutate(request.id);
    }
  };

  const handleReject = (request: RegistrationRequest) => {
    setSelectedRequest(request);
    setShowRejectDialog(true);
  };

  const confirmReject = () => {
    if (!selectedRequest || !rejectionReason.trim()) {
      showToast('error', 'Please provide a rejection reason');
      return;
    }
    rejectMutation.mutate({ id: selectedRequest.id, reason: rejectionReason });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
        Error loading registration requests: {(error as Error).message}
      </div>
    );
  }

  const pendingRequests = Array.isArray(requests) ? requests.filter(r => r.status === 'pending') : [];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Registration Queue</h2>
        <span className="text-sm text-gray-600">
          {pendingRequests.length} pending request{pendingRequests.length !== 1 ? 's' : ''}
        </span>
      </div>

      {pendingRequests.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 text-gray-600 px-4 py-8 rounded text-center">
          No pending registration requests
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Applicant
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requested Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Submitted
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Credentials
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {pendingRequests.map((request) => (
                <tr key={request.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {request.applicantName}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {request.email}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                      {request.requestedRole}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {new Date(request.submittedAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                    {request.credentials}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button
                      onClick={() => handleApprove(request)}
                      disabled={approveMutation.isPending}
                      className="text-green-600 hover:text-green-900 disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(request)}
                      disabled={rejectMutation.isPending}
                      className="text-red-600 hover:text-red-900 disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Reject Registration Request
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Rejecting registration for: <strong>{selectedRequest.applicantName}</strong>
            </p>
            <div className="mb-4">
              <label htmlFor="rejectionReason" className="block text-sm font-medium text-gray-700 mb-2">
                Rejection Reason *
              </label>
              <textarea
                id="rejectionReason"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={4}
                placeholder="Please provide a reason for rejection..."
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowRejectDialog(false);
                  setSelectedRequest(null);
                  setRejectionReason('');
                }}
                disabled={rejectMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={rejectMutation.isPending || !rejectionReason.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
