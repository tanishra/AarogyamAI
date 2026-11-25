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
  frontend/   Next.js 16 + TypeScript web app (port 3000, React 19)
docs/         PORT-NOTES.md — behaviors ported from the legacy codebase
docs/         RUNBOOK.md — deployment + operations runbook
docker/       initdb, nginx edge, prometheus/grafana provisioning
design.md / requirements.md — product spec
```

The legacy Python prototype (`clinical-ai/`) was removed after its
safety-critical components were ported — see `docs/PORT-NOTES.md`.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Backend | Express, TypeScript, Node 22 |
| Database | PostgreSQL 15 (migrations in `packages/backend/src/migrations/`) |
| Cache/session | Redis 7 (sessions, rate limits, lockouts, token blacklist) |
| Audit | PostgreSQL hash-chained records (tamper-evident) |
| AI | AWS Bedrock (Claude) primary, OpenAI fallback |
| Storage | AWS S3 for exports/reports |
| Monitoring | Prometheus + Grafana (`monitoring` compose profile), optional Sentry |
| Edge | nginx TLS edge (prod compose) |
| Tests | Vitest (backend), Vitest + Testing Library (frontend) |

## Getting started

Prerequisites: Node 22+, Docker (for Postgres + Redis).

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

See `docs/ARCHITECTURE.md` for the target architecture and `docs/RUNBOOK.md`
for deployment + operations. Production deploy: `docker compose -f
docker-compose.prod.yml --env-file .env.production up -d` (see RUNBOOK for
env vars, monitoring/backup profiles, TLS, and the restore drill).
