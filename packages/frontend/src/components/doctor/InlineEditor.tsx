'use client';

import { useState } from 'react';
import { AnimatedButton } from '@/components/common';

interface Differential {
  id: string;
  diagnosis: {
    code: string;
    name: string;
    category?: string;
  };
  priority: number;
  clinicalReasoning?: string;
  confidence?: number;
}

interface InlineEditorProps {
  differential: Differential;
  onSave: (updated: Partial<Differential>) => Promise<void>;
  onCancel: () => void;
}

/**
 * Minimal inline editor for differential diagnosis details
 * For MVP - basic editing of clinical reasoning and priority
 */
export function InlineEditor({
  differential,
  onSave,
  onCancel,
}: InlineEditorProps) {
  const [priority, setPriority] = useState(differential.priority);
  const [clinicalReasoning, setClinicalReasoning] = useState(
    differential.clinicalReasoning || ''
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const hasChanges =
    priority !== differential.priority ||
    clinicalReasoning !== (differential.clinicalReasoning || '');

  const handleSave = async () => {
    // Basic validation
    const newErrors: Record<string, string> = {};
    
    if (priority < 1 || priority > 10) {
      newErrors.priority = 'Priority must be between 1 and 10';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        priority,
        clinicalReasoning: clinicalReasoning.trim() || undefined,
      });
    } catch (error) {
      console.error('Error saving:', error);
      alert('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-slate-900">
          Edit: {differential.diagnosis.name}
        </h4>
        <p className="text-xs text-slate-500">ICD-10: {differential.diagnosis.code}</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Priority (1 = highest)
          </label>
          <input
            type="number"
            min="1"
            max="10"
            value={priority}
            onChange={(e) => {
              setPriority(parseInt(e.target.value) || 1);
              setErrors((prev) => ({ ...prev, priority: '' }));
            }}
            className={`ui-focus-ring w-full rounded-lg border px-2 py-1.5 text-sm ${
              errors.priority ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-white'
            }`}
          />
          {errors.priority && (
            <p className="mt-1 text-xs text-red-600">{errors.priority}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">
            Clinical Reasoning
          </label>
          <textarea
            value={clinicalReasoning}
            onChange={(e) => setClinicalReasoning(e.target.value)}
            rows={3}
            placeholder="Explain why this diagnosis is being considered..."
            className="ui-focus-ring w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          />
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 pt-3">
          <AnimatedButton
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </AnimatedButton>
          <AnimatedButton
            size="sm"
            variant="secondary"
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </AnimatedButton>
          {hasChanges && (
            <span className="ml-2 text-xs text-amber-600">Unsaved changes</span>
          )}
        </div>
      </div>
    </div>
  );
}
