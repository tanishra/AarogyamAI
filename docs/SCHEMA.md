# Database Schema

PostgreSQL `admin_panel`. Migrations `000`–`019` in
`packages/backend/src/migrations/` (idempotent, each with a
`*_rollback.sql`). Test DB `admin_panel_test` is rebuilt by
`src/test/globalSetup.ts`.

## Core

| Table | Purpose |
|---|---|
| `users` | All accounts (Patient, Nurse, Doctor, Administrator, DPO). `mfa_*` columns added by `001` |
| `user_profiles` | Extended per-user profile (lazy-created) |
| `sessions` | Refresh-token sessions (device, mfa_verified, expiry, termination) |
| `audit_logs` | Tamper-evident audit chain — `hash` = sha256(canonical entry + `previous_hash`) |
| `consultations` | Completed doctor consultations (drives `/api/metrics/consultations`) |
| `registration_requests` | Pending account applications (approve → creates `users` row) |
| `anomaly_alerts` | Access-anomaly alerts for admins |

## Clinical workflow (encounter = chat session)

| Table | Purpose |
|---|---|
| `chat_sessions` | Patient intake conversations |
| `chat_messages` | Messages in a session |
| `patient_summaries` | AI-extracted structured intake summary |
| `questionnaire_sessions` | Adaptive intake progress (pause/resume state) |
| `vital_signs` | **Canonical vitals table** (019: merged `vitals` in). Units stored per-measure; `encounter_id` = session id |
| `patient_queue` | Workflow queue (`chat_completed → vitals_added → ready_for_doctor → under_review → completed`) |
| `differentials` | **Canonical differential list** (019: merged `clinical_considerations` in). `source`: `ai` = AI suggestion awaiting/after review, `physician` = doctor-added. `status`: `pending/accepted/modified/rejected` |
| `clinical_reasoning` | Doctor's documented reasoning per encounter |
| `clinical_reasoning_versions` | Reasoning edit history (immutable snapshots) |
| `ai_explanations` | Per-differential AI rationale |
| `critical_alerts` | Out-of-range vital alerts for nurses/doctors |

## Consent & compliance

| Table | Purpose |
|---|---|
| `consent_records` | Patient consent grants |
| `consent_withdrawal_requests` | Withdrawal workflow |
| `grievances` | Patient grievances + resolution |
| `data_access_requests` | DPDP/data-access requests |
| `privacy_notices` + `privacy_notice_acknowledgments` | Notice publishing + per-user acks |

## Questionnaire support

| Table | Purpose |
|---|---|
| `question_logs` | Per-question telemetry |
| `family_history` | Family history answers |
| `review_of_systems` | ROS answers |
| `fatigue_metrics` | Intake fatigue signals |

## Merged in 019 (no longer exist)

`vitals` → `vital_signs`; `clinical_considerations` → `differentials`.
Rollback restores both and moves applicable rows back.
