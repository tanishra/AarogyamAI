'use client';

import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserManagementAPI } from '@/lib/api/services/userManagement';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { RoleEditor } from './RoleEditor';
import { AccountStatusToggle } from './AccountStatusToggle';
import { PasswordResetDialog } from './PasswordResetDialog';
import { MFAManager } from './MFAManager';
import type { UserAccount } from '@/lib/api/types';

interface UserDetailProps {
  user: UserAccount;
  onClose: () => void;
  onUpdate: () => void;
}

export function UserDetail({ user, onClose, onUpdate }: UserDetailProps) {
  const [activityPage, setActivityPage] = useState(1);
  const [activityFilters, setActivityFilters] = useState({
    startDate: '',
    endDate: '',
    actionType: '',
  });
  const pageSize = 50;

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['userActivity', user.id, activityPage, activityFilters],
    queryFn: () => UserManagementAPI.getUserActivity(user.id, activityPage, pageSize, activityFilters),
  });

  const totalPages = activityData ? Math.ceil(activityData.total / pageSize) : 0;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-4xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold">User Details</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* User Information */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Name</label>
                <p className="text-gray-900">{user.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Email</label>
                <p className="text-gray-900">{user.email}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">User ID</label>
                <p className="text-gray-900 font-mono text-sm">{user.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Created</label>
                <p className="text-gray-900">{new Date(user.createdAt).toLocaleDateString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Last Password Change</label>
                <p className="text-gray-900">{new Date(user.lastPasswordChange).toLocaleDateString()}</p>
              </div>
              {user.lastMFAVerification && (
                <div>
                  <label className="text-sm font-medium text-gray-500">Last MFA Verification</label>
                  <p className="text-gray-900">{new Date(user.lastMFAVerification).toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </div>

          {/* Management Actions */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Management Actions</h3>
            
            <RoleEditor user={user} onUpdate={onUpdate} />
            <AccountStatusToggle user={user} onUpdate={onUpdate} />
            <PasswordResetDialog user={user} />
            <MFAManager user={user} onUpdate={onUpdate} />
          </div>

          {/* Activity History */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Activity History</h3>
            
            {/* Filters */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={activityFilters.startDate}
                  onChange={(e) => setActivityFilters(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  End Date
                </label>
                <input
                  type="date"
                  value={activityFilters.endDate}
                  onChange={(e) => setActivityFilters(f => ({ ...f, endDate: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Action Type
                </label>
                <input
                  type="text"
                  value={activityFilters.actionType}
                  onChange={(e) => setActivityFilters(f => ({ ...f, actionType: e.target.value }))}
                  placeholder="e.g., login, update"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {activityLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : activityData && activityData.data.length > 0 ? (
              <>
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Timestamp
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Action
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Resource
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Outcome
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {activityData.data.map((activity) => (
                        <tr key={activity.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {new Date(activity.timestamp).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                            {activity.actionType}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {activity.resource}
                            {activity.resourceId && (
                              <span className="text-xs text-gray-400 ml-1">
                                ({activity.resourceId.substring(0, 8)})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            <span className={`px-2 py-1 rounded-full text-xs ${
                              activity.outcome === 'success'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {activity.outcome}
                            </span>
                            {activity.errorDetails && (
                              <p className="text-xs text-red-600 mt-1">{activity.errorDetails}</p>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                      disabled={activityPage === 1}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600">
                      Page {activityPage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setActivityPage(p => Math.min(totalPages, p + 1))}
                      disabled={activityPage === totalPages}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-gray-50 border border-gray-200 text-gray-600 px-4 py-8 rounded text-center">
                No activity history found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
