import { createHash } from 'crypto';

/**
 * Output Filter — ported from clinical-ai agent_worker OutputFilterTool.
 *
 * Last gate before LLM output reaches the doctor dashboard.
 * If any blocked pattern is found, the entire output is blocked —
 * partial blocking is not allowed. On any error, fail safe: block.
 */

export interface OutputFilterResult {
  blocked: boolean;
  text: string;
  matchedCategories: string[];
  outputHash?: string;
}

const BLOCKED_PATTERNS: Array<[string, RegExp]> = [
  [
    'diagnosis_statement',
    /\b(you have|patient has|diagnosis is|diagnosed with|confirms? (the )?diagnosis)\b/i,
  ],
  [
    'definitive_condition',
    /\b(it is definitely|this is certainly|clearly (a|an|the)|without doubt|undoubtedly)\b/i,
  ],
  [
    'treatment_prescription',
    /\b(prescribe|you should take|take \d+\s?mg|administer|start (the patient on|on))\b/i,
  ],
  [
    'prognosis_statement',
    /\b(prognosis is|will (recover|deteriorate|worsen)|life expectancy)\b/i,
  ],
  [
    'direct_medical_advice',
    /\b(you (must|need to|should) (see|visit|consult) a? ?(doctor|specialist|hospital) immediately)\b/i,
  ],
];

export function filterLLMOutput(text: string): OutputFilterResult {
  try {
    const matchedCategories: string[] = [];

    for (const [category, pattern] of BLOCKED_PATTERNS) {
      if (pattern.test(text)) {
        matchedCategories.push(category);
      }
    }

    if (matchedCategories.length > 0) {
      return {
        blocked: true,
        text: '',
        matchedCategories,
        outputHash: createHash('sha256').update(text).digest('hex'),
      };
    }

    return {
      blocked: false,
      text,
      matchedCategories: [],
    };
  } catch {
    // Fail safe — on error, block the output
    return {
      blocked: true,
      text: '',
      matchedCategories: ['filter_error'],
      outputHash: createHash('sha256').update(text).digest('hex'),
    };
  }
}

export const PATTERNS_CHECKED = BLOCKED_PATTERNS.length;
