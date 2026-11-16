# ADR-004: AI safety pipeline enforced inside LLMService

## Status
Accepted

## Context
Patient data went raw to LLM providers; output was unfiltered. The
legacy codebase had a PII stripper and output filter that were never
wired in.

## Decision
- `LLMService.chat()` is the single chokepoint: every message is
  PII-stripped before any provider call (abort on strip failure —
  unstripped text never reaches an LLM)
- Every response is filtered by `outputFilter` (blocked →
  `LLMOutputBlockedError`); blocked output never reaches callers
- `patientChat` degrades to a fixed safe fallback on failure
  (`text_llm → fixed` chain from PORT-NOTES)
- AI output is advisory framing only; doctor approval is required for
  anything to reach the medical record (`differentials` status workflow)

## Consequences
- PII never leaves for the provider unstripped; unsafe output never
  reaches dashboards
- New LLM call sites automatically inherit protection via `chat()`
- Structured callers (considerations, summaries) fail closed on errors
