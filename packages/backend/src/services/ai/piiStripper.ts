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
  // Name prefixes — Dr./Mr./Mrs./Ms./Prof. followed by capitalized names
  ['name_prefix', /\b(Dr|Mr|Mrs|Ms|Prof)\.?\s+[A-Z][a-z]+(\s+[A-Z][a-z]+){0,2}\b/g],
  // Address — door/flat number patterns
  ['address', /\b(flat|house|door|plot|no\.|#)\s*[\w\d-/]+/gi],
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
