'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import { useAuth } from '@/lib/auth';
import type { UserAccount } from '@/lib/api/types';

interface AccountStatusToggleProps {
  user: UserAccount;
  onUpdate: () => void;
}

export function AccountStatusToggle({ user, onUpdate }: AccountStatusToggleProps) {
  const { showToast } = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [reason, setReason] = useState('');

  const isSelf = currentUser?.id === user.id;

  const changeStatusMutation = useMutation({
    mutationFn: ({ isActive, reason }: { isActive: boolean; reason?: string }) =>
      UserManagementAPI.changeUserStatus(user.id, isActive, reason),
    onSuccess: () => {
      showToast('success', `User account ${user.isActive ? 'deactivated' : 'activated'} successfully`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['userActivity', user.id] });
      setShowConfirmDialog(false);
      setReason('');
      onUpdate();
    },
    onError: (error: any) => {
      showToast('error', error.message || 'Failed to update account status');
    },
  });

  const handleToggle = () => {
    if (isSelf && user.isActive) {
      showToast('error', 'You cannot deactivate your own account');
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmToggle = () => {
    changeStatusMutation.mutate({
      isActive: !user.isActive,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Account Status</h4>
      
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Current Status:{' '}
            <span className={`font-semibold ${user.isActive ? 'text-green-600' : 'text-red-600'}`}>
              {user.isActive ? 'Active' : 'Inactive'}
            </span>
          </p>
          {isSelf && user.isActive && (
            <p className="text-xs text-red-600 mt-1">
              You cannot deactivate your own account
            </p>
          )}
        </div>
        
        <button
          onClick={handleToggle}
          disabled={changeStatusMutation.isPending || (isSelf && user.isActive)}
          className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
            user.isActive
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {changeStatusMutation.isPending
            ? 'Processing...'
            : user.isActive
            ? 'Deactivate'
            : 'Activate'}
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              Confirm Account {user.isActive ? 'Deactivation' : 'Activation'}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to {user.isActive ? 'deactivate' : 'activate'} the account for{' '}
              <strong>{user.name}</strong>?
            </p>
            {user.isActive && (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  This will prevent new authentication attempts and terminate all active sessions.
                </p>
                <div className="mb-4">
                  <label htmlFor="statusReason" className="block text-sm font-medium text-gray-700 mb-2">
                    Reason {user.isActive ? '(optional)' : ''}
                  </label>
                  <textarea
                    id="statusReason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder="Provide a reason for this action..."
                  />
                </div>
              </>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setReason('');
                }}
                disabled={changeStatusMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmToggle}
                disabled={changeStatusMutation.isPending}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${
                  user.isActive
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {changeStatusMutation.isPending
                  ? 'Processing...'
                  : user.isActive
                  ? 'Deactivate'
                  : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
