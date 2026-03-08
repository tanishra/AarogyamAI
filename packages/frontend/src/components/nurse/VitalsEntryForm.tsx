'use client';

import { useState } from 'react';
import { AnimatedButton } from '@/components/common';

interface VitalsEntryFormProps {
  patientId: string;
  sessionId: string;
  onSubmit: (vitals: VitalsData) => Promise<void>;
  isSubmitting?: boolean;
  previousVitals?: PreviousVitals | null;
}

export interface VitalsData {
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  temperatureFahrenheit?: number;
  oxygenSaturation?: number;
  respiratoryRate?: number;
  heightCm?: number;
  weightKg?: number;
  notes?: string;
}

interface PreviousVitals {
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
}

export function VitalsEntryForm({ 
  patientId, 
  sessionId, 
  onSubmit, 
  isSubmitting = false,
  previousVitals 
}: VitalsEntryFormProps) {
  const [vitals, setVitals] = useState<VitalsData>({
    bloodPressureSystolic: undefined,
    bloodPressureDiastolic: undefined,
    heartRate: undefined,
    temperatureFahrenheit: undefined,
    oxygenSaturation: undefined,
    respiratoryRate: undefined,
    heightCm: undefined,
    weightKg: undefined,
    notes: '',
  });

  const calculateBMI = (): number | null => {
    if (!vitals.heightCm || !vitals.weightKg) return null;
    const heightM = vitals.heightCm / 100;
    const bmi = vitals.weightKg / (heightM * heightM);
    return Math.round(bmi * 10) / 10;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(vitals);
  };

  const bmi = calculateBMI();

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Previous Vitals Comparison */}
      {previousVitals && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Previous Vitals (for comparison)</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {previousVitals.bloodPressureSystolic && previousVitals.bloodPressureDiastolic && (
              <div>
                <span className="text-slate-500">BP:</span>{' '}
                <span className="font-semibold text-slate-900">
                  {previousVitals.bloodPressureSystolic}/{previousVitals.bloodPressureDiastolic}
                </span>
              </div>
            )}
            {previousVitals.heartRate && (
              <div>
                <span className="text-slate-500">HR:</span>{' '}
                <span className="font-semibold text-slate-900">{previousVitals.heartRate} bpm</span>
              </div>
            )}
            {previousVitals.temperatureFahrenheit && (
              <div>
                <span className="text-slate-500">Temp:</span>{' '}
                <span className="font-semibold text-slate-900">{previousVitals.temperatureFahrenheit}°F</span>
              </div>
            )}
            {previousVitals.oxygenSaturation && (
              <div>
                <span className="text-slate-500">O2:</span>{' '}
                <span className="font-semibold text-slate-900">{previousVitals.oxygenSaturation}%</span>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Recorded: {new Date(previousVitals.recordedAt).toLocaleString()}
          </p>
        </div>
      )}

      {/* Vital Signs Input */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Blood Pressure */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Blood Pressure (mmHg)
          </label>
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Systolic"
              value={vitals.bloodPressureSystolic || ''}
              onChange={(e) => setVitals(prev => ({ 
                ...prev, 
                bloodPressureSystolic: e.target.value ? Number(e.target.value) : undefined 
              }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
            />
            <span className="self-center text-slate-400">/</span>
            <input
              type="number"
              placeholder="Diastolic"
              value={vitals.bloodPressureDiastolic || ''}
              onChange={(e) => setVitals(prev => ({ 
                ...prev, 
                bloodPressureDiastolic: e.target.value ? Number(e.target.value) : undefined 
              }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
            />
          </div>
        </div>

        {/* Heart Rate */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Heart Rate (bpm)
          </label>
          <input
            type="number"
            placeholder="e.g., 72"
            value={vitals.heartRate || ''}
            onChange={(e) => setVitals(prev => ({ 
              ...prev, 
              heartRate: e.target.value ? Number(e.target.value) : undefined 
            }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
        </div>

        {/* Temperature */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Temperature (°F)
          </label>
          <input
            type="number"
            step="0.1"
            placeholder="e.g., 98.6"
            value={vitals.temperatureFahrenheit || ''}
            onChange={(e) => setVitals(prev => ({ 
              ...prev, 
              temperatureFahrenheit: e.target.value ? Number(e.target.value) : undefined 
            }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
        </div>

        {/* Oxygen Saturation */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            O2 Saturation (%)
          </label>
          <input
            type="number"
            placeholder="e.g., 98"
            value={vitals.oxygenSaturation || ''}
            onChange={(e) => setVitals(prev => ({ 
              ...prev, 
              oxygenSaturation: e.target.value ? Number(e.target.value) : undefined 
            }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
        </div>

        {/* Respiratory Rate */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Respiratory Rate (breaths/min)
          </label>
          <input
            type="number"
            placeholder="e.g., 16"
            value={vitals.respiratoryRate || ''}
            onChange={(e) => setVitals(prev => ({ 
              ...prev, 
              respiratoryRate: e.target.value ? Number(e.target.value) : undefined 
            }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
        </div>

        {/* Height */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Height (cm)
          </label>
          <input
            type="number"
            placeholder="e.g., 170"
            value={vitals.heightCm || ''}
            onChange={(e) => setVitals(prev => ({ 
              ...prev, 
              heightCm: e.target.value ? Number(e.target.value) : undefined 
            }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
        </div>

        {/* Weight */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Weight (kg)
          </label>
          <input
            type="number"
            step="0.1"
            placeholder="e.g., 70"
            value={vitals.weightKg || ''}
            onChange={(e) => setVitals(prev => ({ 
              ...prev, 
              weightKg: e.target.value ? Number(e.target.value) : undefined 
            }))}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
          />
        </div>

        {/* BMI Display */}
        {bmi && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              BMI (calculated)
            </label>
            <div className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
              {bmi}
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Clinical Notes (optional)
        </label>
        <textarea
          rows={3}
          placeholder="Enter any observations or context for the doctor..."
          value={vitals.notes || ''}
          onChange={(e) => setVitals(prev => ({ ...prev, notes: e.target.value }))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end">
        <AnimatedButton
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving Vitals...' : 'Save Vitals'}
        </AnimatedButton>
      </div>
    </form>
  );
}
