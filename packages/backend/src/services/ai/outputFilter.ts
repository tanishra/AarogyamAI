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
  [
    // Dosage given as an instruction — verb+dose or dose+frequency.
    // Bare dose mentions (history echo: "patient reports metformin 500mg")
    // stay allowed; the advisory gate blocks only prescriptive framing.
    'dosage_instruction',
    /(?<!(reports?|reported|history of|already|currently|on|was) )\b(take|taking|start|starting|administer|give|prescribe|dose|dosage|increase|reduce)\b[^.]{0,40}\b\d+(\.\d+)?\s?(mg|mcg|ml|iu|tablets?|capsules?|drops?|puffs?)\b|\b\d+(\.\d+)?\s?(mg|mcg|ml|tablets?|capsules?)\s+(once|twice|thrice|daily|every|od|bd|tds|qid|hs|sos)\b/i,
  ],
  [
    // Confident-diagnosis paraphrases
    'confident_diagnosis',
    /\b(is suffering from|suffers from|confirms? (the |a |an )?(presence|diagnosis|condition)|indicates? (that |the )?(patient |a |an )?(has|is)|most likely (diagnosis|condition|cause) is|classic (case|signs?|presentation) of|consistent with a diagnosis of|diagnostic of)\b/i,
  ],
  [
    // "recommend/suggest/advise ... take/start/medication/dose"
    'medication_recommendation',
    /\b(recommend|suggest|advise|recommendation is)\b[^.]{0,60}\b(take|taking|start|starting|medication|medicine|drug|dose|dosage|course of|prescription)\b/i,
  ],
  [
    // Prescribing verbs with object — "start the patient on X", "begin X"
    'prescribing_verb',
    /\b(start|begin|initiate|put|place)\s+(the\s+)?(patient\s+)?(on\s+)?[a-z-]{3,}\s*(therapy|treatment|regimen|antibiotics?)\b/i,
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
