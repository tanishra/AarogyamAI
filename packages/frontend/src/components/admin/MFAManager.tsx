'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import type { UserAccount } from '@/lib/api/types';

interface MFAManagerProps {
  user: UserAccount;
  onUpdate: () => void;
}

export function MFAManager({ user, onUpdate }: MFAManagerProps) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [action, setAction] = useState<'enable' | 'disable' | 'reenroll'>('enable');
  const [mfaMethod, setMfaMethod] = useState<'totp' | 'sms'>('totp');

  const mfaMutation = useMutation({
    mutationFn: ({ enabled, method }: { enabled: boolean; method?: 'totp' | 'sms' }) =>
      UserManagementAPI.updateMFA(user.id, enabled, method),
    onSuccess: () => {
      const actionText = action === 'enable' ? 'enabled' : action === 'disable' ? 'disabled' : 're-enrollment required';
      showToast('success', `MFA ${actionText} for ${user.name}`);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['userActivity', user.id] });
      setShowDialog(false);
      onUpdate();
    },
    onError: (error: any) => {
      showToast('error', error.message || 'Failed to update MFA settings');
    },
  });

  const handleAction = (actionType: 'enable' | 'disable' | 'reenroll') => {
    setAction(actionType);
    setShowDialog(true);
  };

  const confirmAction = () => {
    if (action === 'enable') {
      mfaMutation.mutate({ enabled: true, method: mfaMethod });
    } else if (action === 'disable') {
      mfaMutation.mutate({ enabled: false });
    } else {
      // Re-enroll: disable then enable
      mfaMutation.mutate({ enabled: false });
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">Multi-Factor Authentication</h4>
      
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">
              Status:{' '}
              <span className={`font-semibold ${user.mfaEnabled ? 'text-green-600' : 'text-gray-600'}`}>
                {user.mfaEnabled ? `Enabled (${user.mfaMethod?.toUpperCase()})` : 'Disabled'}
              </span>
            </p>
            {user.lastMFAVerification && (
              <p className="text-xs text-gray-500 mt-1">
                Last verification: {new Date(user.lastMFAVerification).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex space-x-2">
          {!user.mfaEnabled ? (
            <button
              onClick={() => handleAction('enable')}
              disabled={mfaMutation.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              Enable MFA
            </button>
          ) : (
            <>
              <button
                onClick={() => handleAction('disable')}
                disabled={mfaMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                Disable MFA
              </button>
              <button
                onClick={() => handleAction('reenroll')}
                disabled={mfaMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Require Re-enrollment
              </button>
            </>
          )}
        </div>
      </div>

      {/* Action Dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {action === 'enable' && 'Enable MFA'}
              {action === 'disable' && 'Disable MFA'}
              {action === 'reenroll' && 'Require MFA Re-enrollment'}
            </h3>
            
            <p className="text-sm text-gray-600 mb-4">
              {action === 'enable' && `Enable multi-factor authentication for ${user.name}?`}
              {action === 'disable' && `Disable multi-factor authentication for ${user.name}?`}
              {action === 'reenroll' && `Require ${user.name} to re-enroll their MFA device?`}
            </p>

            {action === 'enable' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  MFA Method
                </label>
                <select
                  value={mfaMethod}
                  onChange={(e) => setMfaMethod(e.target.value as 'totp' | 'sms')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="totp">Authenticator App (TOTP)</option>
                  <option value="sms">SMS</option>
                </select>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
              <p className="text-xs text-blue-800">
                {action === 'enable' && 'The user will be prompted to set up MFA on their next login.'}
                {action === 'disable' && 'The user will no longer be required to provide MFA codes.'}
                {action === 'reenroll' && 'The user will need to set up a new MFA device on their next login.'}
              </p>
              <p className="text-xs text-blue-600 mt-2">
                A notification email will be sent to: <strong>{user.email}</strong>
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDialog(false)}
                disabled={mfaMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmAction}
                disabled={mfaMutation.isPending}
                className={`px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 ${
                  action === 'disable'
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {mfaMutation.isPending ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
