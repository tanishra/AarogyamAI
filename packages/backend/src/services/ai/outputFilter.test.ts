import { describe, expect, it } from 'vitest';

import { filterLLMOutput, PATTERNS_CHECKED } from './outputFilter';

describe('filterLLMOutput', () => {
  it('passes safe differential-framing language', () => {
    const result = filterLLMOutput(
      'Clinical features are consistent with possible gastritis. Consider further investigation for physician review.'
    );
    expect(result.blocked).toBe(false);
    expect(result.text).toContain('gastritis');
    expect(result.matchedCategories).toHaveLength(0);
  });

  it('blocks diagnosis statements', () => {
    const result = filterLLMOutput('The diagnosis is acute myocardial infarction.');
    expect(result.blocked).toBe(true);
    expect(result.matchedCategories).toContain('diagnosis_statement');
    expect(result.outputHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('blocks "you have" phrasing', () => {
    const result = filterLLMOutput('Based on symptoms, you have pneumonia.');
    expect(result.blocked).toBe(true);
    expect(result.matchedCategories).toContain('diagnosis_statement');
  });

  it('blocks definitive condition language', () => {
    const result = filterLLMOutput('It is definitely a pulmonary embolism.');
    expect(result.blocked).toBe(true);
    expect(result.matchedCategories).toContain('definitive_condition');
  });

  it('blocks treatment prescriptions', () => {
    const result = filterLLMOutput('You should take 500 mg of amoxicillin twice daily.');
    expect(result.blocked).toBe(true);
    expect(result.matchedCategories).toContain('treatment_prescription');
  });

  it('blocks prognosis statements', () => {
    const result = filterLLMOutput('The prognosis is poor; life expectancy is limited.');
    expect(result.blocked).toBe(true);
    expect(result.matchedCategories).toContain('prognosis_statement');
  });

  it('blocks direct emergency directives', () => {
    const result = filterLLMOutput('You must see a doctor immediately.');
    expect(result.blocked).toBe(true);
    expect(result.matchedCategories).toContain('direct_medical_advice');
  });

  it('blocks entire output when one sentence is unsafe', () => {
    const result = filterLLMOutput(
      'Consider appendicitis among possibilities. You have a serious infection.'
    );
    expect(result.blocked).toBe(true);
    expect(result.text).toBe('');
  });

  it('exposes the checked pattern count', () => {
    expect(PATTERNS_CHECKED).toBe(5);
  });
});
