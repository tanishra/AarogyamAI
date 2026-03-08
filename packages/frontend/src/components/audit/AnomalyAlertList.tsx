'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuditLogAPI } from '@/lib/api/services/auditLog';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { showToast } from '@/lib/notifications/toast';

interface AnomalyAlert {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  triggerCondition: string;
  timestamp: string;
  details: {
    recordCount?: number;
    timeWindow?: string;
    accessTime?: string;
  };
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export default function AnomalyAlertList() {
  const queryClient = useQueryClient();
  const [selectedAlert, setSelectedAlert] = useState<AnomalyAlert | null>(null);

  // Fetch anomaly alerts
  const { data, isLoading, error } = useQuery({
    queryKey: ['anomaly-alerts'],
    queryFn: () => AuditLogAPI.getAnomalyAlerts(),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Acknowledge mutation
  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => AuditLogAPI.acknowledgeAnomaly(alertId),
    onSuccess: () => {
      showToast('Anomaly alert acknowledged', 'success');
      queryClient.invalidateQueries({ queryKey: ['anomaly-alerts'] });
      setSelectedAlert(null);
    },
    onError: (error) => {
      showToast(
        error instanceof Error ? error.message : 'Failed to acknowledge alert',
        'error'
      );
    },
  });

  const alerts: AnomalyAlert[] = Array.isArray(data) ? (data as AnomalyAlert[]) : [];
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="large" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="text-red-800 font-semibold">Error Loading Anomaly Alerts</h3>
          <p className="text-red-600 mt-2">
            {error instanceof Error ? error.message : 'Failed to load anomaly alerts'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Alert Banner */}
      {unacknowledgedCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div>
              <h3 className="text-red-800 font-semibold">
                {unacknowledgedCount} Unacknowledged Anomal{unacknowledgedCount > 1 ? 'ies' : 'y'}
              </h3>
              <p className="text-red-600 text-sm mt-1">
                Unusual access patterns detected. Please review and acknowledge.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Alerts List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Anomaly Alerts</h3>
          <p className="text-sm text-gray-600 mt-1">
            {alerts.length} total alert{alerts.length !== 1 ? 's' : ''} ({unacknowledgedCount} unacknowledged)
          </p>
        </div>

        <div className="divide-y divide-gray-200">
          {alerts.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-lg font-medium">No anomalies detected</p>
              <p className="text-sm mt-1">All access patterns appear normal</p>
            </div>
          ) : (
            alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-6 hover:bg-gray-50 transition-colors ${
                  !alert.acknowledged ? 'bg-red-50' : ''
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {!alert.acknowledged && (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                          New
                        </span>
                      )}
                      <h4 className="text-sm font-semibold text-gray-900">
                        {alert.triggerCondition}
                      </h4>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-gray-500">User:</span>
                        <span className="ml-2 text-gray-900 font-medium">
                          {alert.userName} ({alert.userRole})
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Detected:</span>
                        <span className="ml-2 text-gray-900">
                          {new Date(alert.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Details */}
                    <div className="bg-gray-50 rounded p-3 text-sm">
                      {alert.details.recordCount && (
                        <div>
                          <span className="text-gray-600">Records accessed:</span>
                          <span className="ml-2 font-medium text-gray-900">
                            {alert.details.recordCount}
                          </span>
                        </div>
                      )}
                      {alert.details.timeWindow && (
                        <div>
                          <span className="text-gray-600">Time window:</span>
                          <span className="ml-2 font-medium text-gray-900">
                            {alert.details.timeWindow}
                          </span>
                        </div>
                      )}
                      {alert.details.accessTime && (
                        <div>
                          <span className="text-gray-600">Access time:</span>
                          <span className="ml-2 font-medium text-gray-900">
                            {alert.details.accessTime}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Acknowledgment Info */}
                    {alert.acknowledged && (
                      <div className="mt-3 text-sm text-gray-600">
                        Acknowledged by {alert.acknowledgedBy} on{' '}
                        {alert.acknowledgedAt && new Date(alert.acknowledgedAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="ml-4">
                    {!alert.acknowledged && (
                      <button
                        onClick={() => setSelectedAlert(alert)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Acknowledgment Confirmation Dialog */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Acknowledge Anomaly</h3>
            </div>

            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to acknowledge this anomaly alert?
              </p>
              <div className="bg-gray-50 rounded p-3 text-sm">
                <div className="font-medium text-gray-900 mb-2">
                  {selectedAlert.triggerCondition}
                </div>
                <div className="text-gray-600">
                  User: {selectedAlert.userName} ({selectedAlert.userRole})
                </div>
                <div className="text-gray-600">
                  Detected: {new Date(selectedAlert.timestamp).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
              <button
                onClick={() => setSelectedAlert(null)}
                disabled={acknowledgeMutation.isPending}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => acknowledgeMutation.mutate(selectedAlert.id)}
                disabled={acknowledgeMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {acknowledgeMutation.isPending ? (
                  <>
                    <LoadingSpinner size="small" />
                    Acknowledging...
                  </>
                ) : (
                  'Acknowledge'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
