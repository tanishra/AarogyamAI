import { createHash } from 'crypto';

/**
 * PII Stripper — ported from clinical-ai agent_worker PIIStripperTool.
 *
 * Strips personally identifiable information from text before it is sent
 * to any LLM provider. If stripping fails, the caller MUST abort — never
 * send unstripped text to the LLM.
 */

export interface PIIStripResult {
  strippedText: string;
  categoriesFound: string[];
  inputHash: string;
  wasModified: boolean;
}

const PATTERNS: Array<[string, RegExp]> = [
  // Phone — ISD prefix or local 10-digit (India)
  ['phone', /(\+91[\s-]?)?[6-9]\d{9}/g],
  // Email
  ['email', /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],
  // Aadhaar — 12 digits (may have separators every 4)
  ['aadhaar', /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g],
  // PAN — 5 letters, 4 digits, 1 letter
  ['pan', /\b[A-Z]{5}\d{4}[A-Z]\b/g],
  // DOB — common Indian formats dd/mm/yyyy, dd-mm-yy
  ['dob', /\b(0?[1-9]|[12]\d|3[01])[/-](0?[1-9]|1[0-2])[/-](\d{4}|\d{2})\b/g],
  // Name prefixes — Dr./Mr./Mrs./Ms./Prof./Shri/Smt./Kum. followed by capitalized names
  ['name_prefix', /\b(Dr|Mr|Mrs|Ms|Prof|Shri|Smt|Kum|Master|Baby)\.?\s+[A-Z][a-z]+(\s+[A-Z][a-z]+){0,2}\b/g],
  // Bare-name contexts — "patient named X", "my name is X", "I am X Y".
  // NO /i flag: the name part must require real capitals — a case-insensitive
  // name group over-redacts ("i am feeling sick" → eats "feeling sick").
  ['name_context', /\b([Pp]atient|[Nn]ame[d]?\s+is|named|Named|[Mm]r\.|[Ii]\s+am|[Ii]'m|myself|Myself|[Ss]\/o|[Dd]\/o|[Ww]\/o)\s+(?:[Mm]r\.?\s+|[Mm]s\.?\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g],
  // Lowercase-context names — only after strong introducers, and never on
  // common verb/adjective openers (the stoplist lookahead guards "i am
  // feeling sick" / "called for help" from over-redaction).
  ['name_context_lowercase', /\b(?:name is|myself|called|known as|goes by|nickname|i am|i'm)\s+(?!is\b|was\b|feeling\b|not\b|very\b|so\b|having\b|been\b|suffering\b|taking\b|reporting\b|reports?\b|a\b|an\b|the\b|my\b|his\b|her\b|in\b|on\b|at\b|for\b|to\b|from\b|back\b|here\b|there\b|now\b|also\b|still\b|just\b)([a-z][a-z]+(?:\s+[a-z][a-z]+){0,2})\b/g],
  // Nickname mentions — "called Munna", "goes by Chotu", "nickname Pappu"
  ['nickname', /\b(?:called|Called|goes by|Goes by|known as|Known as|nickname|Nickname)\s+([A-Z][a-z]+)\b/g],
  // Relative names — "my son Rahul", "wife Sita" (keyword + Capitalized)
  ['relative_name', /\b(?:[Ss]on|[Dd]aughter|[Ww]ife|[Hh]usband|[Ff]ather|[Mm]other|[Bb]rother|[Ss]ister|[Uu]ncle|[Aa]unt|[Cc]ousin|[Nn]ephew|[Nn]iece)\s+([A-Z][a-z]+)\b/g],
  // Locality names — keyword→name AND name→keyword directions:
  // "village Rampur", "gaon Sitapur", "dist Pune", "Nashik town",
  // "from Rampur village", "Shivpuri district".
  ['locality', /\b(?:[Vv]illage|[Gg]aon|[Gg]ram|[Tt]own|[Dd]ist(?:rict)?|[Tt]ehsil|[Tt]aluka|[Pp]ost\s+[Oo]ffice|[Pp]\.?[Oo]\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b|\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:village|gaon|town|district|dist\.|tehsil|taluka)\b|\b(?:from|of|in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s+(?:village|gaon|district|dist\.|tehsil)\b/g],
  // Sector/block style urban addresses — "Sector 21", "Block C", "Phase 3".
  ['sector', /\b(?:[Ss]ector|[Bb]lock|[Pp]ocket|[Pp]hase|[Ww]ard|[Gg]ali|[Mm]ohalla)\s+\d+[A-Z]?\b/g],
  // Facility names — "admitted at Apollo Hospital", "transferred to
  // Civil Hospital Rajgarh" — proper-noun sequence + facility word.
  ['facility', /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\s+(?:[Hh]ospital|[Nn]ursing\s+[Hh]ome|[Cc]linic|[Dd]ispensary|[Mm]edical\s+[Cc]ollege|[Hh]ealth\s+[Cc]ent(?:er|re)|[Tt]rauma\s+[Cc]ent(?:er|re))\b|\b(?:AIIMS|AIMS|CMC|KIMS|PGIMER|SGPGI|Apollo|Fortis|Medanta|Narayana)\b/g],
  // Dates spelled with month names — "15 March 1982", "born 2 Jan 1985",
  // "March 15, 1982".
  ['dob_words', /\b(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s+(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sept?|Oct|Nov|Dec)\s*,?\s*\d{4}\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\s*,?\s*\d{4}\b/gi],
  // Address — door/flat number patterns and street/locality words
  ['address', /\b(flat|house|door|plot|no\.?|#)\s*[\w./-]+(?:\s+[\w./-]+)?/gi],
  ['street_address', /\b\d{1,4}[\w/-]*\s+[A-Z][a-z]+\s+(street|st\.|road|rd\.|lane|avenue|ave\.|marg|nagar|colony|sector|block|vihar|enclave|layout|extension|extn\.)\b/gi],
  // Indian PIN code — 6 digits, first digit 1-9
  ['pincode', /\b[1-9]\d{5}\b/g],
  // Spoken age — "45-year-old", "aged 60", "60 years old"
  ['age', /\b(aged?\s+\d{1,3}|\d{1,3}\s*[- ]\s*(year|yr)s?\s*[- ]?old)\b/gi],
  // Medical record / patient identifiers
  ['mrn', /\b(mrn|uhid|patient\s*id|reg(?:istration)?\.?\s*(?:no|number|id)?)\.?\s*[:#]?\s*[A-Z0-9-]{4,}\b/gi],
];

const PLACEHOLDER = '[REDACTED]';

export function stripPII(text: string): PIIStripResult {
  if (!text || typeof text !== 'string') {
    throw new Error('PIIStripper: input text must be a non-empty string');
  }

  const inputHash = createHash('sha256').update(text).digest('hex');
  const categoriesFound: string[] = [];
  let result = text;

  for (const [category, pattern] of PATTERNS) {
    const replaced = result.replace(pattern, () => {
      return PLACEHOLDER;
    });
    if (replaced !== result) {
      categoriesFound.push(category);
      result = replaced;
    }
  }

  return {
    strippedText: result,
    categoriesFound,
    inputHash,
    wasModified: result !== text,
  };
}

const NER_TIMEOUT_MS = 3000;

interface NerEntity {
  text: string;
  label?: string;
}

/**
 * Async variant — runs the regex layer first, then (when PII_NER_URL is
 * configured) calls an external NER service for entity spans the regex
 * layer cannot express (free-form names, unusual address forms).
 *
 * Fail-closed contract: a NER timeout, non-200 response, or malformed body
 * THROWS — the caller must abort rather than ship partially-stripped text
 * to an LLM provider. With PII_NER_URL unset this is regex-only and never
 * performs network I/O.
 */
export async function stripPIIAsync(text: string): Promise<PIIStripResult> {
  const base = stripPII(text);
  const nerUrl = process.env.PII_NER_URL;
  if (!nerUrl) {
    return base;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NER_TIMEOUT_MS);
  let entities: NerEntity[];
  try {
    const res = await fetch(nerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: base.strippedText }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`NER service returned ${res.status}`);
    }
    const body = (await res.json()) as { entities?: NerEntity[] };
    if (!Array.isArray(body.entities)) {
      throw new Error('NER service returned malformed body');
    }
    entities = body.entities;
  } finally {
    clearTimeout(timer);
  }

  let result = base.strippedText;
  const categoriesFound = [...base.categoriesFound];
  for (const entity of entities) {
    if (entity?.text && result.includes(entity.text)) {
      result = result.split(entity.text).join(PLACEHOLDER);
      if (!categoriesFound.includes('ner_entity')) {
        categoriesFound.push('ner_entity');
      }
    }
  }

  return {
    strippedText: result,
    categoriesFound,
    inputHash: base.inputHash,
    wasModified: result !== text,
  };
}
