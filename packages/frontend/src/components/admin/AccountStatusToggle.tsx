'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { UserAccount } from '@/lib/api/types';

interface AccountStatusToggleProps {
  user: UserAccount;
  onUpdate: () => void;
}

export function AccountStatusToggle({ user, onUpdate }: AccountStatusToggleProps) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [reason, setReason] = useState('');

  const isSelf = currentUser?.id === user.id;

  const changeStatusMutation = useMutation({
    mutationFn: ({ isActive, reason }: { isActive: boolean; reason?: string }) =>
      UserManagementAPI.changeUserStatus(user.id, isActive, reason),
    onSuccess: () => {
      showToast('success', user.isActive ? t('admin.deactivatedOk') : t('admin.activatedOk'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['userActivity', user.id] });
      setShowConfirmDialog(false);
      setReason('');
      onUpdate();
    },
    onError: (error: Error) => {
      showToast('error', error.message || t('admin.statusFailed'));
    },
  });

  const handleToggle = () => {
    if (isSelf && user.isActive) {
      showToast('error', t('admin.cannotDeactivateSelf'));
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
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('admin.accountStatus')}</h4>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            {t('admin.currentStatus')}{' '}
            <span className={`font-semibold ${user.isActive ? 'text-green-600' : 'text-red-600'}`}>
              {user.isActive ? t('common.active') : t('common.inactive')}
            </span>
          </p>
          {isSelf && user.isActive && (
            <p className="text-xs text-red-600 mt-1">
              {t('admin.cannotDeactivateSelf')}
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
            ? t('admin.processing')
            : user.isActive
            ? t('admin.deactivate')
            : t('admin.activate')}
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">
              {t('admin.confirmAccount', { action: user.isActive ? t('admin.deactivation') : t('admin.activation') })}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('admin.confirmStatusBody', {
                action: user.isActive ? t('admin.actionDeactivate') : t('admin.actionActivate'),
                name: user.name,
              })}
            </p>
            {user.isActive && (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {t('admin.deactivationNote')}
                </p>
                <div className="mb-4">
                  <label htmlFor="statusReason" className="block text-sm font-medium text-gray-700 mb-2">
                    {user.isActive ? t('admin.reasonOptional') : t('admin.reason')}
                  </label>
                  <textarea
                    id="statusReason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={3}
                    placeholder={t('admin.statusReasonPlaceholder')}
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
                {t('common.cancel')}
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
                  ? t('admin.processing')
                  : user.isActive
                  ? t('admin.deactivate')
                  : t('admin.activate')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
