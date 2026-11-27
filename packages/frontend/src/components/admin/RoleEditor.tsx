'use client';

import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { useToast } from '@/lib/notifications/toast';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { UserAccount } from '@/lib/api/types';

interface RoleEditorProps {
  user: UserAccount;
  onUpdate: () => void;
}

const ROLES: UserAccount['role'][] = ['Patient', 'Nurse', 'Doctor', 'Administrator', 'DPO'];

export function RoleEditor({ user, onUpdate }: RoleEditorProps) {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<UserAccount['role']>(user.role);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const isSelf = currentUser?.id === user.id;
  const isChangingOwnAdminRole = isSelf && user.role === 'Administrator' && selectedRole !== 'Administrator';

  const changeRoleMutation = useMutation({
    mutationFn: (newRole: UserAccount['role']) => UserManagementAPI.changeUserRole(user.id, newRole),
    onSuccess: () => {
      showToast('success', t('admin.roleUpdated'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['userActivity', user.id] });
      setShowConfirmDialog(false);
      onUpdate();
    },
    onError: (error: Error) => {
      showToast('error', error.message || t('admin.roleUpdateFailed'));
    },
  });

  const handleRoleChange = () => {
    if (selectedRole === user.role) {
      showToast('info', t('admin.roleAlreadySet', { role: selectedRole }));
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmRoleChange = () => {
    changeRoleMutation.mutate(selectedRole);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{t('admin.roleManagement')}</h4>
      
      <div className="flex items-center space-x-4">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {t('admin.currentRole')} <span className="font-semibold">{user.role}</span>
          </label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value as UserAccount['role'])}
            disabled={isChangingOwnAdminRole}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          {isChangingOwnAdminRole && (
            <p className="text-xs text-red-600 mt-1">
              {t('admin.cannotRemoveOwnAdmin')}
            </p>
          )}
        </div>
        
        <button
          onClick={handleRoleChange}
          disabled={changeRoleMutation.isPending || selectedRole === user.role || isChangingOwnAdminRole}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {changeRoleMutation.isPending ? t('admin.updating') : t('admin.changeRole')}
        </button>
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">{t('admin.confirmRoleChange')}</h3>
            <p className="text-sm text-gray-600 mb-4">
              {t('admin.confirmRoleBody', { name: user.name })}
            </p>
            <div className="bg-gray-50 rounded p-3 mb-4 space-y-1">
              <p className="text-sm">
                <span className="text-gray-600">{t('admin.currentRole')}</span>{' '}
                <span className="font-semibold text-red-600">{user.role}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-600">{t('admin.newRole')}</span>{' '}
                <span className="font-semibold text-green-600">{selectedRole}</span>
              </p>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              {t('admin.roleSessionNote')}
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmDialog(false)}
                disabled={changeRoleMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmRoleChange}
                disabled={changeRoleMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {changeRoleMutation.isPending ? t('admin.updating') : t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
