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

/**
 * Normalize text before pattern matching — defeats obfuscation that swaps
 * lookalike characters for ASCII (Cyrillic/Greek homoglyphs), hides zero-
 * width characters inside keywords, or spaces words out ("p r e s c r i b e").
 * Normalization is applied ONLY for detection; the returned text on a pass
 * is the original, byte-for-byte.
 */
const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic confusables (written as \u escapes — survives any encoding path)
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x',
  'у': 'y', 'ѕ': 's', 'і': 'i', 'ј': 'j', 'һ': 'h', 'ԁ': 'd',
  'ԛ': 'q', 'ɡ': 'g', 'ӏ': 'l', 'ո': 'n', 'ν': 'v',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H',
  'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
  // Greek confusables
  'α': 'a', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x', 'ω': 'w',
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K',
  'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Χ': 'X',
};

// Char class for the map — built from escapes so it never depends on the
// source file surviving a non-UTF8 round trip.
const HOMOGLYPH_RE = new RegExp(
  `[${Object.keys(HOMOGLYPHS)
    .map((ch) => `\\u${ch.codePointAt(0)!.toString(16).padStart(4, '0')}`)
    .join('')}]`,
  'g',
);

function normalizeForDetection(text: string): string {
  // NFKC folds compatibility forms (full-width chars, ligatures, styled
  // math alphabet) into ASCII equivalents.
  let s = text.normalize('NFKC');
  // Strip zero-width + directional formatting characters
  // (ZWSP-ZWJ/RLM range, bidi controls, BOM).
  s = s.replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '');
  // Map remaining confusables.
  s = s.replace(HOMOGLYPH_RE, (ch) => HOMOGLYPHS[ch] ?? ch);
  // Collapse spaced-out words: "p r e s c r i b e" → "prescribe".
  // Runs of 4+ single letters separated by spaces are joined.
  s = s.replace(/\b(?:[A-Za-z] ){3,}[A-Za-z]\b/g, (m) => m.replace(/ /g, ''));
  return s;
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
    /\b(prognosis is|will (recover|deteriorate|worsen)|life expectancy|outcome (looks|is|seems) (bleak|poor|grim|dire)|expect (deterioration|worsening|decline)|prognosis is guarded)\b/i,
  ],
  [
    'direct_medical_advice',
    /\b(you (must|need to|should) (see|visit|consult) a? ?(doctor|specialist|hospital) immediately)\b/i,
  ],
  [
    // Dosage given as an instruction — verb+dose.
    // Bare dose mentions (history echo: "patient reports metformin 500mg")
    // stay allowed; the advisory gate blocks only prescriptive framing.
    'dosage_instruction',
    /(?<!(reports?|reported|history of|already|currently|on|was) )\b(take|taking|start|starting|administer|give|prescribe|dose|dosage|increase|reduce)\b[^.]{0,40}\b\d+(\.\d+)?\s?(mg|mcg|ml|iu|tablets?|capsules?|drops?|puffs?)\b/i,
  ],
  [
    // Bare dose+frequency — "500mg twice daily". Prescriptive on its own,
    // BUT identical in shape to a medication-history echo, so it is vetoed
    // when the text carries history markers (see HISTORY_CONTEXT below).
    'dose_frequency',
    /\b\d+(\.\d+)?\s?(mg|mcg|ml|tablets?|capsules?)\s+(once|twice|thrice|daily|every|od|bd|tds|qid|hs|sos)\b/i,
  ],
  [
    // Confident-diagnosis paraphrases
    'confident_diagnosis',
    /\b(is suffering from|suffers from|confirms? (the |a |an )?(presence|diagnosis|condition)|indicates? (that |the )?(patient |a |an )?(has|is)|most likely (diagnosis|condition|cause) is|classic (case|signs?|presentation) of|consistent with a diagnosis of|diagnostic of|points? to (this|it|the patient) being|fits? [a-z- ]{3,40}(perfectly|precisely)|textbook (case|example|presentation) of)\b/i,
  ],
  [
    // "recommend/suggest/advise ... take/start/medication/dose"
    'medication_recommendation',
    /\b(recommend|suggest|advise|recommendation is)\b[^.]{0,60}\b(take|taking|start|starting|medication|medicine|drug|dose|dosage|course of|prescription)\b/i,
  ],
  [
    // Prescribing verbs with object — "start the patient on X", "begin X"
    'prescribing_verb',
    /\b(start|begin|initiate|put|place)\s+(the\s+)?(patient\s+)?(on\s+)?([\w-]+\s+){0,3}(therapy|treatment|regimen|antibiotics?)\b/i,
  ],
  [
    // Imperative medication directive — dose-free form.
    // "stop your medication", "discontinue the antibiotic" kill people;
    // dosage context is not required for these to be unsafe.
    'medication_directive',
    /\b(take|swallow|inhale|inject|apply|consume|start|stop|discontinue|quit|increase|decrease|double|halve)\s+(?:(?:taking|using|applying)\s+)?(your\s+|the\s+|patient'?s\s+|his\s+|her\s+)?(medication|medicine|antibiotic|insulin|statin|steroid|tablet|pill|dose|dosage|course|prescription|inhaler|drops?)\b/i,
  ],
  [
    // Output echoes a jailbreak or claims to be running without safeguards.
    'jailbreak_echo',
    /\b(ignor(e|ing|ed)\s+(all\s+|any\s+|previous\s+|prior\s+)?(instructions?|guidelines?|rules|safety|restrictions?)|without\s+(safety|any)\s+(filters?|restrictions?|guidelines?)|unrestricted\s+mode|jailbreak|dan\s+mode|developer\s+mode\s+enabled|no\s+(longer|more)\s+(bound|restricted))\b/i,
  ],
  [
    // Romanized Hindi/Hinglish medication directives — "dawa lo",
    // "goli leni chahiye", "dawai band karo".
    'hinglish_directive',
    /\b(dawai?|dawa|goli|tablet|injection)\s+(lo|lijiye|lijie|le\s+lo|lelo|leni\s+chahiye|band\s+karo|band\s+kijiye|shuru\s+karo|rok\s+do)\b|\b(lo|lijiye|band\s+karo|shuru\s+karo)\s+(dawai?|dawa|goli|tablet)\b/i,
  ],
  [
    // Base64/hex-encoded payload echoes — model complied with an encoded
    // instruction and is repeating encoded content. Long unbroken base64
    // or hex runs have no legitimate place in clinical advice.
    'encoded_payload',
    /\b[A-Za-z0-9+/]{48,}={0,2}\b|\b(?:[0-9a-fA-F]{2}[\s:]?){12,}\b/,
  ],
];

// Medication-history framing — when present, a bare dose+frequency match is
// an echo of the patient's record, not a prescription. Never vetoes the
// imperative verb form (dosage_instruction): "should take" is never history.
const HISTORY_CONTEXT =
  /\b(reports?|reported|history|on record|recorded|currently|existing|previous|previously|takes?|taking|patient-reported|on a regimen|maintenance)\b/i;

export function filterLLMOutput(text: string): OutputFilterResult {
  try {
    const matchedCategories: string[] = [];
    // Match against the normalized copy — homoglyph/zero-width/spacing
    // tricks collapse to plain ASCII before patterns run.
    const normalized = normalizeForDetection(text);
    const hasHistoryContext = HISTORY_CONTEXT.test(normalized);

    for (const [category, pattern] of BLOCKED_PATTERNS) {
      if (!pattern.test(normalized)) {
        continue;
      }
      // dose_frequency alone + history framing = medication record echo.
      if (category === 'dose_frequency' && hasHistoryContext) {
        continue;
      }
      matchedCategories.push(category);
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
