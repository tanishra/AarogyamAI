# Port Notes — clinical-ai (Python) → packages (TypeScript)

Extracted before deleting `clinical-ai/` in Phase 1. These are the behavior
requirements that must be preserved as the TS implementation matures.

Source files referenced below lived under `clinical-ai/` (deleted; see git
history before `pre-refactor-baseline` tag for recovery).

## 1. PII stripping — PORTED ✅

From `agent_worker/agent/tools/pii_stripper.py` →
`packages/backend/src/services/ai/piiStripper.ts`.

- Strips: Indian phone (+91/10-digit), email, Aadhaar, PAN, DOB,
  honorific-prefixed names, address fragments.
- Returns `inputHash` (SHA-256) for audit; logs categories found, never PHI.
- **Critical rule:** if stripping fails, the pipeline MUST abort — never send
  unstripped text to an LLM.

## 2. LLM output filtering — PORTED ✅

From `agent_worker/agent/tools/output_filter.py` →
`packages/backend/src/services/ai/outputFilter.ts`.

- Blocks: diagnosis statements, definitive-condition language, treatment
  prescriptions, prognosis statements, direct emergency directives.
- **Blocking is all-or-nothing** — one unsafe sentence blocks the whole output.
- **Fail-safe:** any filter error blocks the output.
- Safe framing allowed: "consider", "may suggest", "for physician review",
  "possible", "potential", "warrants investigation".

## 3. AI pipeline fallback semantics — PENDING (Phase 3)

From `agent_worker/agent/agent_loop.py`. The AgentLoop ran:

1. PII strip (abort all on failure)
2. ContextAggregationSkill (fail → fallback, but doctor still sees
   structured context + vitals if they completed)
3. DifferentialFramingSkill (fail → fallback; **never partial differentials**)
4. ReasoningTraceSkill (fail → **non-fatal**, log + continue)

Result contract: on fallback, include whatever completed before failure,
`differentials: []` always, record `fallback_reason`, keep `urgency_flag`,
`outlier_flags`, `emergency_flagged`. Loop is stateless; never writes to DB —
the worker persists. Fallback reasons used: `PII_STRIP_FAILED`, `LLM_ERROR`,
`OUTPUT_BLOCKED`, `TIMEOUT`.

## 4. Intake fallback chain — PENDING (Phase 3)

From `api/services/intake_orchestrator.py`.

- Valid intake modes: `text_llm` (adaptive LLM chat) and `fixed`
  (fixed questionnaire). Fallback chain: `text_llm → fixed`.
- Mode switches are recorded in `fallback_history` entries of shape
  `{from_mode, to_mode, reason, at}` and kept in session state (Redis, 24h TTL).
- Intake session state tracks: `active_mode`, `questionnaire_done`,
  `questions_remaining`, `emergency_flagged`,
  `nurse_verification_required`, `current_topic`, `pending_question`.
- Sessions are patient-owned — every operation verifies ownership first.

## 5. Audit chain verification — PENDING (Phase 3)

From `api/services/audit_service.py` + `packages/backend` `AuditLogService`.

- Audit records form a hash chain: each record stores `previousHash` +
  `recordHash = sha256(previousHash + canonical record)`.
- Verification endpoint must recompute the chain and report the first
  divergence — do not trust stored flags.
- Chain integrity check is an admin/DPO operation, fully audited itself.

## 6. Voice/intake providers — FUTURE WORK (not ported)

From `api/services/voice_providers.py`, `realtime_transcriber.py`.

- Deepgram realtime transcription + provider abstraction existed for voice
  intake. Not ported — no voice UI exists in `packages/`. Re-add only when a
  voice feature is scheduled.
