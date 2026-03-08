'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import type { UserAccount } from '@/lib/api/types';

interface PasswordResetDialogProps {
  user: UserAccount;
}

export function PasswordResetDialog({ user }: PasswordResetDialogProps) {
  const { showToast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => UserManagementAPI.initiatePasswordReset(user.id),
    onSuccess: () => {
      showToast('success', `Password reset email sent to ${user.email}`);
      setShowConfirmDialog(false);
    },
    onError: (error: any) => {
      showToast('error', error.message || 'Failed to initiate password reset');
    },
  });

  const handleReset = () => {
    if (!user.isActive) {
      showToast('error', 'Cannot reset password for inactive account');
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmReset = () => {
    resetMutation.mutate();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Password Management</h4>
      
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Last Password Change:{' '}
            <span className="font-semibold">
              {new Date(user.lastPasswordChange).toLocaleDateString()}
            </span>
          </p>
          {!user.isActive && (
            <p className="text-xs text-red-600 mt-1">
              Cannot reset password for inactive account
            </p>
          )}
        </div>
        
        <button
          onClick={handleReset}
          disabled={resetMutation.isPending || !user.isActive}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resetMutation.isPending ? 'Sending...' : 'Reset Password'}
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirm Password Reset</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to initiate a password reset for <strong>{user.name}</strong>?
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
              <p className="text-sm text-blue-800">
                A secure reset link will be sent to: <strong>{user.email}</strong>
              </p>
              <p className="text-xs text-blue-600 mt-2">
                The reset link will expire in 24 hours.
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={resetMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmReset}
                disabled={resetMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Sending...' : 'Send Reset Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
