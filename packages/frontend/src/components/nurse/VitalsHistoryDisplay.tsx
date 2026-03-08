'use client';

interface VitalsRecord {
  id: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  temperatureFahrenheit?: number;
  oxygenSaturation?: number;
  respiratoryRate?: number;
  heightCm?: number;
  weightKg?: number;
  bmi?: number;
  recordedAt: string;
  recordedBy?: string;
}

interface VitalsHistoryDisplayProps {
  vitals: VitalsRecord[];
  isLoading?: boolean;
}

export function VitalsHistoryDisplay({ vitals, isLoading = false }: VitalsHistoryDisplayProps) {
  if (isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-cyan-600" />
        <p className="mt-2 text-sm text-slate-500">Loading vitals history...</p>
      </div>
    );
  }

  if (vitals.length === 0) {
    return (
      <div className="py-8 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-sm font-medium text-slate-700">No previous vitals recorded</p>
        <p className="text-xs text-slate-500 mt-1">Vitals history will appear here once recorded</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
        Previous Vitals ({vitals.length})
      </h3>

      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {vitals.map((record) => (
          <div
            key={record.id}
            className="rounded-xl border border-slate-200 bg-white p-4 hover:border-cyan-300 hover:shadow-sm transition-all"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-900">
                {new Date(record.recordedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              {record.recordedBy && (
                <span className="text-xs text-slate-500">by {record.recordedBy}</span>
              )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {record.bloodPressureSystolic && record.bloodPressureDiastolic && (
                <div className="text-sm">
                  <span className="text-slate-500">BP:</span>{' '}
                  <span className="font-semibold text-slate-900">
                    {record.bloodPressureSystolic}/{record.bloodPressureDiastolic}
                  </span>
                  <span className="text-xs text-slate-400 ml-1">mmHg</span>
                </div>
              )}

              {record.heartRate && (
                <div className="text-sm">
                  <span className="text-slate-500">HR:</span>{' '}
                  <span className="font-semibold text-slate-900">{record.heartRate}</span>
                  <span className="text-xs text-slate-400 ml-1">bpm</span>
                </div>
              )}

              {record.temperatureFahrenheit && (
                <div className="text-sm">
                  <span className="text-slate-500">Temp:</span>{' '}
                  <span className="font-semibold text-slate-900">{record.temperatureFahrenheit}</span>
                  <span className="text-xs text-slate-400 ml-1">°F</span>
                </div>
              )}

              {record.oxygenSaturation && (
                <div className="text-sm">
                  <span className="text-slate-500">O2:</span>{' '}
                  <span className="font-semibold text-slate-900">{record.oxygenSaturation}</span>
                  <span className="text-xs text-slate-400 ml-1">%</span>
                </div>
              )}

              {record.respiratoryRate && (
                <div className="text-sm">
                  <span className="text-slate-500">RR:</span>{' '}
                  <span className="font-semibold text-slate-900">{record.respiratoryRate}</span>
                  <span className="text-xs text-slate-400 ml-1">/min</span>
                </div>
              )}

              {record.heightCm && (
                <div className="text-sm">
                  <span className="text-slate-500">Height:</span>{' '}
                  <span className="font-semibold text-slate-900">{record.heightCm}</span>
                  <span className="text-xs text-slate-400 ml-1">cm</span>
                </div>
              )}

              {record.weightKg && (
                <div className="text-sm">
                  <span className="text-slate-500">Weight:</span>{' '}
                  <span className="font-semibold text-slate-900">{record.weightKg}</span>
                  <span className="text-xs text-slate-400 ml-1">kg</span>
                </div>
              )}

              {record.bmi && (
                <div className="text-sm">
                  <span className="text-slate-500">BMI:</span>{' '}
                  <span className="font-semibold text-slate-900">{record.bmi}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
