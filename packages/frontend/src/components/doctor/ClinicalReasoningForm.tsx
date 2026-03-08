'use client';

import { AnimatedButton } from '@/components/common';

interface ClinicalReasoningFormProps {
  reasoning: {
    differentialDiagnosis: string;
    diagnosticPlan: string;
    reasoningRationale: string;
    finalNotes: string;
  };
  onChange: (field: string, value: string) => void;
  onSave: () => void;
  onApprove: () => void;
  isSaving: boolean;
  isApproving: boolean;
  reasoningId: string | null;
}

export function ClinicalReasoningForm({
  reasoning,
  onChange,
  onSave,
  onApprove,
  isSaving,
  isApproving,
  reasoningId,
}: ClinicalReasoningFormProps) {
  return (
    <div className="ui-surface p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Clinical Reasoning Documentation</h3>
          <p className="mt-1 text-sm text-slate-600">Structure your differential and plan with audit-ready traceability.</p>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
          {reasoningId ? 'Draft Saved' : 'New Draft'}
        </span>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Differential Diagnosis (one per line)
          </span>
          <textarea
            value={reasoning.differentialDiagnosis}
            onChange={(e) => onChange('differentialDiagnosis', e.target.value)}
            rows={4}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="1. Primary diagnosis&#10;2. Alternative diagnosis&#10;3. Rule out..."
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Diagnostic Plan</span>
          <textarea
            value={reasoning.diagnosticPlan}
            onChange={(e) => onChange('diagnosticPlan', e.target.value)}
            rows={4}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="List tests, labs, imaging, and immediate management steps..."
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Clinical Reasoning Rationale
          </span>
          <textarea
            value={reasoning.reasoningRationale}
            onChange={(e) => onChange('reasoningRationale', e.target.value)}
            rows={4}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="Explain why key findings support or weaken each diagnosis..."
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Final Notes</span>
          <textarea
            value={reasoning.finalNotes}
            onChange={(e) => onChange('finalNotes', e.target.value)}
            rows={3}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder="Follow-up, precautions, and patient counseling notes..."
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <AnimatedButton onClick={onSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Draft'}
          </AnimatedButton>

          {reasoningId ? (
            <AnimatedButton onClick={onApprove} disabled={isApproving}>
              {isApproving ? 'Approving...' : 'Approve & Complete'}
            </AnimatedButton>
          ) : null}
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-800">
          Documentation is versioned and tied to audit logs. Save iteratively and approve only after final review.
        </div>
      </div>
    </div>
  );
}
