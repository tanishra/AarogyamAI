# AarogyamAI

AI-assisted clinical workflow and pre-consultation support system. AarogyamAI
replaces fragmented clinic paperwork — consent forms, verbal intake, manual
vitals entry, handwritten notes — with one secure, auditable workflow where the
doctor stays in control of every clinical decision.

## What it does

1. **Patient** authenticates (OTP/JWT), grants DPDP-style digital consent, then
   completes an adaptive intake questionnaire that can pause and resume.
2. **Nurse** sees a live queue, reviews intake, and records vitals. Outlier
   vitals raise critical alerts.
3. **AI synthesis** strips PII, structures intake + vitals into context, and
   generates differential considerations with reasoning traces.
4. **Doctor** reviews, accepts/edits/rejects each suggestion, documents final
   reasoning and treatment, and commits the encounter to the medical record.
5. **Every action** is written to a hash-chained, tamper-evident audit trail.

The AI is decision **support**, not decision **making**. It never diagnoses,
prescribes, triages, or acts on its own — all output is framed for physician
review and nothing enters the record without doctor sign-off.

## Repository layout

```
packages/
  backend/    Express + TypeScript API (port 3001)
  frontend/   Next.js 14 + TypeScript web app (port 3000)
docs/         PORT-NOTES.md — behaviors ported from the legacy codebase
docker/      initdb scripts for local Postgres
infrastructure/ Terraform (see Phase 6 status in docs)
design.md / requirements.md — product spec
```

The legacy Python prototype (`clinical-ai/`) was removed after its
safety-critical components were ported — see `docs/PORT-NOTES.md`.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (App Router), React, TypeScript |
| Backend | Express, TypeScript |
| Database | PostgreSQL 15 (migrations in `packages/backend/src/migrations/`) |
| Cache/session | Redis 7 |
| Audit | DynamoDB hash-chained records (PostgreSQL fallback) |
| AI | AWS Bedrock (Claude) primary, OpenAI fallback |
| Storage | AWS S3 for exports/reports |
| Tests | Vitest (backend), Vitest + Testing Library (frontend) |

## Getting started

Prerequisites: Node 20+, Docker (for Postgres + Redis).

```bash
# Start Postgres (admin_panel + admin_panel_test DBs) and Redis
docker compose up -d postgres redis

# Install dependencies (npm workspaces)
npm install

# Configure backend env
cp packages/backend/.env.example packages/backend/.env
# defaults point at the docker-compose stack

# Apply migrations
cd packages/backend && npm run migrate

# Run everything
cd ../.. && npm run dev
# frontend → http://localhost:3000   backend → http://localhost:3001
```

## Development commands

```bash
npm run dev        # both apps
npm run build      # build both workspaces
npm run test       # backend + frontend test suites
npm run lint       # lint both workspaces

cd packages/backend
npm run typecheck  # tsc --noEmit
npm run migrate:status
```

## Verification status

See `docs/ARCHITECTURE.md` for the target architecture and refactor progress.
The `pre-refactor-baseline` tag marks the green baseline: backend 385 tests,
frontend 102 tests, 0 lint errors, clean builds, 10 API contract tests.
