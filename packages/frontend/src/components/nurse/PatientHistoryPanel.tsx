'use client';

import { useEffect, useState } from 'react';

interface HistoricalVitals {
  id: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  temperatureFahrenheit?: number;
  oxygenSaturation?: number;
  recordedAt: string;
  recordedBy: string;
}

interface PatientHistoryPanelProps {
  patientId: string;
  token: string;
}

export function PatientHistoryPanel({ patientId, token }: PatientHistoryPanelProps) {
  const [vitalsHistory, setVitalsHistory] = useState<HistoricalVitals[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    void loadVitalsHistory();
  }, [patientId]);

  const loadVitalsHistory = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/nurse/patient/${patientId}/vitals-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setVitalsHistory(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load vitals history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ui-surface p-4">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Previous Vitals</h3>

      {isLoading ? (
        <div className="py-6 text-center">
          <div className="mx-auto h-7 w-7 animate-spin rounded-full border-b-2 border-blue-600" />
        </div>
      ) : vitalsHistory.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-500">No previous vitals recorded</p>
      ) : (
        <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
          {vitalsHistory.map((vitals) => (
            <div
              key={vitals.id}
              className="rounded-xl border border-slate-200 bg-white/90 p-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-sm"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-slate-500">{new Date(vitals.recordedAt).toLocaleDateString()}</span>
                <span className="text-xs text-slate-500">by {vitals.recordedBy}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
                {vitals.bloodPressureSystolic && vitals.bloodPressureDiastolic ? (
                  <p>
                    BP: <span className="font-semibold text-slate-900">{vitals.bloodPressureSystolic}/{vitals.bloodPressureDiastolic}</span>
                  </p>
                ) : null}
                {vitals.heartRate ? (
                  <p>
                    HR: <span className="font-semibold text-slate-900">{vitals.heartRate} bpm</span>
                  </p>
                ) : null}
                {vitals.temperatureFahrenheit ? (
                  <p>
                    Temp: <span className="font-semibold text-slate-900">{vitals.temperatureFahrenheit}F</span>
                  </p>
                ) : null}
                {vitals.oxygenSaturation ? (
                  <p>
                    SpO2: <span className="font-semibold text-slate-900">{vitals.oxygenSaturation}%</span>
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
