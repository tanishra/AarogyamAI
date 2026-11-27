'use client';

import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import { useI18n } from '@/lib/i18n';
import type { UserAccount } from '@/lib/api/types';

interface PasswordResetDialogProps {
  user: UserAccount;
}

export function PasswordResetDialog({ user }: PasswordResetDialogProps) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const resetMutation = useMutation({
    mutationFn: () => UserManagementAPI.initiatePasswordReset(user.id),
    onSuccess: () => {
      showToast('success', t('admin.resetSent', { email: user.email }));
      setShowConfirmDialog(false);
    },
    onError: (error: Error) => {
      showToast('error', error.message || t('admin.resetFailed'));
    },
  });

  const handleReset = () => {
    if (!user.isActive) {
      showToast('error', t('admin.cannotResetInactive'));
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmReset = () => {
    resetMutation.mutate();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('admin.passwordMgmt')}</h4>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            {t('admin.lastPasswordChange')}:{' '}
            <span className="font-semibold">
              {new Date(user.lastPasswordChange).toLocaleDateString()}
            </span>
          </p>
          {!user.isActive && (
            <p className="text-xs text-red-600 mt-1">
              {t('admin.cannotResetInactive')}
            </p>
          )}
        </div>
        
        <button
          onClick={handleReset}
          disabled={resetMutation.isPending || !user.isActive}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resetMutation.isPending ? t('admin.sending') : t('admin.resetPassword')}
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="password-reset-dialog-title"
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
          >
            <h3 id="password-reset-dialog-title" className="text-lg font-semibold mb-4">{t('admin.confirmResetTitle')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('admin.confirmResetBody', { name: user.name })}
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-4">
              <p className="text-sm text-blue-800">
                {t('admin.resetLinkPre')} <strong>{user.email}</strong>
              </p>
              <p className="text-xs text-blue-600 mt-2">
                {t('admin.resetExpiry')}
              </p>
            </div>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={resetMutation.isPending}
                autoFocus
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmReset}
                disabled={resetMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {resetMutation.isPending ? t('admin.sending') : t('admin.sendResetLink')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
