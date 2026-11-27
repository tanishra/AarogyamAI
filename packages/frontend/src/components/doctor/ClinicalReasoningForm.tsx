'use client';

import { AnimatedButton } from '@/components/common';
import { useI18n } from '@/lib/i18n';

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
  const { t } = useI18n();
  return (
    <div className="ui-surface p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t('review.title')}</h3>
          <p className="mt-1 text-sm text-slate-600">{t('review.formSubtitle')}</p>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
          {reasoningId ? t('review.draftSaved') : t('review.newDraft')}
        </span>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('review.diffLabel')}
          </span>
          <textarea
            value={reasoning.differentialDiagnosis}
            onChange={(e) => onChange('differentialDiagnosis', e.target.value)}
            rows={4}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder={t('review.diffPlaceholder')}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('review.diagPlan')}</span>
          <textarea
            value={reasoning.diagnosticPlan}
            onChange={(e) => onChange('diagnosticPlan', e.target.value)}
            rows={4}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder={t('review.diagPlanPlaceholder')}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('review.rationaleLabel')}
          </span>
          <textarea
            value={reasoning.reasoningRationale}
            onChange={(e) => onChange('reasoningRationale', e.target.value)}
            rows={4}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder={t('review.rationalePlaceholder')}
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('review.notes')}</span>
          <textarea
            value={reasoning.finalNotes}
            onChange={(e) => onChange('finalNotes', e.target.value)}
            rows={3}
            className="ui-focus-ring w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            placeholder={t('review.notesPlaceholder')}
          />
        </label>

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
          <AnimatedButton onClick={onSave} disabled={isSaving}>
            {isSaving ? t('common.loading') : t('common.save')}
          </AnimatedButton>

          {reasoningId ? (
            <AnimatedButton onClick={onApprove} disabled={isApproving}>
              {isApproving ? t('common.loading') : t('review.approve')}
            </AnimatedButton>
          ) : null}
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2 text-xs text-sky-800">
          {t('review.docsNote')}
        </div>
      </div>
    </div>
  );
}
