# Architecture

## System overview

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js frontend (port 3000)                               │
│  patient/  nurse/  doctor/  admin/  audit/  metrics/  dpo/  │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api → rewrite → backend :3001
┌──────────────────────────▼──────────────────────────────────┐
│  Express backend (port 3001)                                │
│  middleware: security headers, CORS, rate limit, sanitize,  │
│              request logging, error handler                 │
│  routes/ → services/ → repositories/                        │
└───────┬──────────────┬──────────────┬──────────────┬────────┘
        │              │              │              │
   PostgreSQL       Redis         DynamoDB        AWS
   (clinical data)  (sessions,    (audit chain)   (Bedrock LLM,
                    blacklist)                    S3, Cognito)
```

## Request flow (backend)

`src/index.ts` builds the app: `requestLogger → securityHeaders → cors →
json body → sanitizeInput → rateLimit → /api routes → errorHandler`.

Auth: JWT access + refresh tokens (`src/auth/`), token blacklist checked in
`authMiddleware` against Redis; MFA via TOTP (speakeasy/qrcode).

## Clinical workflow

| Stage | Route module | Roles |
|---|---|---|
| Consent + intake | `consent.ts`, `patientWorkflow.ts`, `patientChat.ts` | Patient |
| Queue + vitals | `nurseWorkflow.ts` | Nurse |
| AI synthesis + review | `doctorWorkflow.ts` | Doctor |
| Admin/compliance | `userManagement.ts`, `audit.ts`, `metrics.ts`, `consent.ts` | Admin, DPO |
| Auth | `auth.ts`, `profile.ts` | all |

## AI safety model (`src/services/ai/`)

Ported from the legacy implementation (`docs/PORT-NOTES.md`):

- `piiStripper.ts` — redacts phone/email/Aadhaar/PAN/DOB/names/addresses
  before any text reaches an LLM. **Strip failure must abort the call.**
- `outputFilter.ts` — blocks diagnostic/prescriptive/prognostic language.
  Blocking is all-or-nothing and fails closed.
- Pipeline semantics (Phase 3): PII strip → LLM → output filter → fallback.
  Fallback still returns completed earlier stages; never partial
  differentials.

## Data layer

- PostgreSQL `admin_panel` database; migrations `000`–`018` in
  `src/migrations/` (idempotent, auto-discovered, rollback files alongside).
- Audit log: hash-chained records (`previousHash` + `recordHash`), DynamoDB
  primary in production with PostgreSQL fallback in local dev.
- Redis: session state, token blacklist, rate-limit counters.

## Refactor status

- [x] Phase 0: green baseline (`pre-refactor-baseline`)
- [x] Phase 1: single codebase — legacy removed, naming unified, docs
- [x] Phase 2: backend layering — `src/composition.ts` container,
      `WorkflowRepository`/`ProfileRepository` own all route SQL,
      zod-validated config, winston logger, typed errors + `asyncHandler`
- [x] Phase 3: real audit writes (PostgreSQL hash-chain + tamper-evident
      `verifyIntegrity`), real TOTP MFA via speakeasy, real email
      notifications, real metrics aggregation, AI pipeline
      (PII→LLM→filter→fallback) enforced inside `LLMService.chat`
- [x] Phase 4: DB consolidation — `vitals`→`vital_signs`,
      `clinical_considerations`→`differentials` (migration 019 +
      rollback); `docs/SCHEMA.md`
- [ ] Phase 5: frontend dedup + typed API layer
- [ ] Phase 6: infra — compose, Dockerfiles, Terraform, CI
- [ ] Phase 7: ADRs + final verification + `post-refactor` tag
