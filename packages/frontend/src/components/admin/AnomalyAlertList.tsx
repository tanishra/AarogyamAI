'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

interface AnomalyAlert {
  id: string;
  user_id: string;
  user_name: string;
  trigger_condition: string;
  details: string;
  timestamp: string;
  acknowledged: boolean;
}

export default function AnomalyAlertList() {
  const [selectedAlert, setSelectedAlert] = useState<AnomalyAlert | null>(null);

  const { data: alerts, isLoading, refetch } = useQuery({
    queryKey: ['anomaly-alerts'],
    queryFn: async () => {
      const response = await fetch('/api/audit/anomalies', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      if (!response.ok) throw new Error('Failed to fetch anomaly alerts');
      const result = await response.json();
      return result.data as AnomalyAlert[];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const handleAcknowledge = async (alertId: string) => {
    try {
      const response = await fetch(`/api/audit/anomalies/${alertId}/acknowledge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to acknowledge alert');

      refetch();
      setSelectedAlert(null);
    } catch (error) {
      console.error('Acknowledge error:', error);
      alert('Failed to acknowledge anomaly alert');
    }
  };

  const getTriggerLabel = (condition: string) => {
    const labels: { [key: string]: string } = {
      high_frequency_access: 'High Frequency Access',
      off_hours_access: 'Off-Hours Access',
      statistical_anomaly: 'Statistical Anomaly',
    };
    return labels[condition] || condition;
  };

  const getTriggerColor = (condition: string) => {
    const colors: { [key: string]: string } = {
      high_frequency_access: 'bg-red-100 text-red-800',
      off_hours_access: 'bg-yellow-100 text-yellow-800',
      statistical_anomaly: 'bg-orange-100 text-orange-800',
    };
    return colors[condition] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            <div className="h-16 bg-gray-200 rounded"></div>
            <div className="h-16 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  const unacknowledgedAlerts = alerts?.filter(a => !a.acknowledged) || [];

  return (
    <>
      {unacknowledgedAlerts.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <p className="text-sm text-yellow-700">
                <span className="font-medium">{unacknowledgedAlerts.length} unacknowledged anomaly alert{unacknowledgedAlerts.length > 1 ? 's' : ''}</span>
                {' '}require attention
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Anomaly Alerts</h3>
            <button
              onClick={() => refetch()}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {unacknowledgedAlerts.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No unacknowledged anomaly alerts
            </div>
          ) : (
            unacknowledgedAlerts.map((alert) => (
              <div key={alert.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getTriggerColor(alert.trigger_condition)}`}>
                        {getTriggerLabel(alert.trigger_condition)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(alert.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-base font-medium text-gray-900 mb-1">
                      {alert.user_name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {alert.details}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedAlert(alert)}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    Acknowledge
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Acknowledge Confirmation Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Acknowledge Anomaly Alert</h3>
            <p className="text-sm text-gray-600 mb-4">
              Are you sure you want to acknowledge this anomaly alert? This action will mark the alert as reviewed.
            </p>
            <div className="p-3 bg-gray-50 rounded mb-4">
              <p className="text-sm font-medium text-gray-700">User: {selectedAlert.user_name}</p>
              <p className="text-sm text-gray-600 mt-1">{selectedAlert.details}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => handleAcknowledge(selectedAlert.id)}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Acknowledge
              </button>
              <button
                onClick={() => setSelectedAlert(null)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
