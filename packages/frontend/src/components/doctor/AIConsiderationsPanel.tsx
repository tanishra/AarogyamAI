'use client';

import { useState } from 'react';
import { AnimatedButton } from '@/components/common';

interface Consideration {
  id: string;
  conditionName: string;
  likelihood: 'high' | 'moderate' | 'low';
  urgency: 'urgent' | 'routine' | 'non-urgent';
  supportingFactors: string[];
  explanation: string;
  status?: 'pending' | 'accepted' | 'modified' | 'rejected';
}

interface AIConsiderationsPanelProps {
  considerations: Consideration[];
  onGenerate: () => void;
  onUpdateStatus: (considerationId: string, status: string) => void;
  isGenerating: boolean;
}

export function AIConsiderationsPanel({
  considerations,
  onGenerate,
  onUpdateStatus,
  isGenerating,
}: AIConsiderationsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const getLikelihoodColor = (likelihood: string) => {
    switch (likelihood) {
      case 'high':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'moderate':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'routine':
        return 'bg-sky-100 text-sky-700 border-sky-200';
      case 'non-urgent':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="ui-surface overflow-hidden p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">AI Clinical Considerations</h3>
          <p className="mt-1 text-sm text-slate-600">Decision-support suggestions for physician review and adjudication.</p>
        </div>
        <AnimatedButton onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? 'Generating...' : 'Generate Considerations'}
        </AnimatedButton>
      </div>

      {considerations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No considerations generated yet</p>
          <p className="mt-1 text-xs text-slate-500">Run AI generation after reviewing nurse summary and vitals.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {considerations.map((consideration) => (
            <div
              key={consideration.id}
              className="rounded-2xl border border-slate-200 bg-white/90 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-slate-900">{consideration.conditionName}</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getLikelihoodColor(consideration.likelihood)}`}>
                      {consideration.likelihood} likelihood
                    </span>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getUrgencyColor(consideration.urgency)}`}>
                      {consideration.urgency}
                    </span>
                    {consideration.status && consideration.status !== 'pending' ? (
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                          consideration.status === 'accepted'
                            ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                            : consideration.status === 'rejected'
                              ? 'border-rose-200 bg-rose-100 text-rose-700'
                              : 'border-sky-200 bg-sky-100 text-sky-700'
                        }`}
                      >
                        {consideration.status}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  onClick={() => setExpandedId(expandedId === consideration.id ? null : consideration.id)}
                  className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Toggle detail"
                >
                  <svg
                    className={`h-5 w-5 transition-transform ${expandedId === consideration.id ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {expandedId === consideration.id ? (
                <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 animate-fade-in">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Clinical Reasoning</p>
                    <p className="mt-1 text-sm text-slate-800">{consideration.explanation}</p>
                  </div>

                  {consideration.supportingFactors.length > 0 ? (
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supporting Factors</p>
                      <ul className="mt-1 space-y-1">
                        {consideration.supportingFactors.map((factor, idx) => (
                          <li key={idx} className="text-sm text-slate-700">
                            <span className="mr-2 text-cyan-600">•</span>
                            {factor}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <AnimatedButton size="sm" onClick={() => onUpdateStatus(consideration.id, 'accepted')}>
                      Accept
                    </AnimatedButton>
                    <AnimatedButton size="sm" variant="secondary" onClick={() => onUpdateStatus(consideration.id, 'modified')}>
                      Modify
                    </AnimatedButton>
                    <AnimatedButton size="sm" variant="danger" onClick={() => onUpdateStatus(consideration.id, 'rejected')}>
                      Reject
                    </AnimatedButton>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-xs text-amber-800">
        AI output is advisory only. Final diagnosis and treatment decisions remain with the attending physician.
      </div>
    </div>
  );
}
