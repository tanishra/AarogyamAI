'use client';

import { useState } from 'react';
import { AnimatedButton } from '@/components/common';

interface CriticalAlert {
  id: string;
  vital_name: string;
  vital_value: string;
  severity: 'critical' | 'high' | 'moderate';
  normal_range: string;
  recommended_action: string;
  patient_name?: string;
  created_at: string;
}

interface CriticalAlertBannerProps {
  alerts: CriticalAlert[];
  onAcknowledge: (alertId: string) => Promise<void>;
}

export function CriticalAlertBanner({ alerts, onAcknowledge }: CriticalAlertBannerProps) {
  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (alerts.length === 0) {
    return null;
  }

  const handleAcknowledge = async (alertId: string) => {
    setAcknowledgingId(alertId);
    try {
      await onAcknowledge(alertId);
    } finally {
      setAcknowledgingId(null);
    }
  };

  const getSeverityStyles = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-50 border-red-300 text-red-900';
      case 'high':
        return 'bg-orange-50 border-orange-300 text-orange-900';
      case 'moderate':
        return 'bg-yellow-50 border-yellow-300 text-yellow-900';
      default:
        return 'bg-slate-50 border-slate-300 text-slate-900';
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-600 text-white';
      case 'high':
        return 'bg-orange-600 text-white';
      case 'moderate':
        return 'bg-yellow-600 text-white';
      default:
        return 'bg-slate-600 text-white';
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-red-600 animate-pulse" />
        <h3 className="text-sm font-semibold text-red-900 uppercase tracking-wide">
          Critical Alerts ({alerts.length})
        </h3>
      </div>

      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-xl border-2 p-4 ${getSeverityStyles(alert.severity)} transition-all`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${getSeverityBadge(alert.severity)}`}>
                  {alert.severity}
                </span>
                <h4 className="font-bold text-base">{alert.vital_name}</h4>
              </div>

              <div className="space-y-1 text-sm">
                <p>
                  <span className="font-semibold">Value:</span> {alert.vital_value}
                </p>
                <p>
                  <span className="font-semibold">Normal Range:</span> {alert.normal_range}
                </p>
                {alert.patient_name && (
                  <p>
                    <span className="font-semibold">Patient:</span> {alert.patient_name}
                  </p>
                )}
              </div>

              {/* Expandable Recommended Action */}
              <button
                onClick={() => setExpandedId(expandedId === alert.id ? null : alert.id)}
                className="mt-2 text-sm font-semibold underline hover:no-underline"
              >
                {expandedId === alert.id ? 'Hide' : 'Show'} Recommended Action
              </button>

              {expandedId === alert.id && (
                <div className="mt-2 p-3 rounded-lg bg-white/50 border border-current">
                  <p className="text-sm font-medium">{alert.recommended_action}</p>
                </div>
              )}
            </div>

            <AnimatedButton
              size="sm"
              variant="secondary"
              onClick={() => handleAcknowledge(alert.id)}
              disabled={acknowledgingId === alert.id}
              className="shrink-0"
            >
              {acknowledgingId === alert.id ? 'Acknowledging...' : 'Acknowledge'}
            </AnimatedButton>
          </div>

          <p className="text-xs mt-3 opacity-75">
            Alert created: {new Date(alert.created_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}
