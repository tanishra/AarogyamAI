# AGENTS.md — contributor & agent guide

## What this repo is

AarogyamAI: an AI-assisted clinical workflow system (Express + Next.js +
PostgreSQL). The AI is decision **support only** — it never diagnoses,
prescribes, or acts independently. Doctor approval is required for anything
AI-generated to reach the medical record.

## Layout

- `packages/backend` — Express API (port 3001): `routes/ → services/ →
  repositories/`, migrations `000`–`018` in `src/migrations/`
- `packages/frontend` — Next.js 14 App Router app (port 3000)
- `docs/ARCHITECTURE.md` — architecture + refactor phase status
- `docs/PORT-NOTES.md` — behavior contracts ported from the deleted legacy
  codebase (read before touching `src/services/ai/`)
- `docker-compose.yml` — local Postgres (`admin_panel`, `admin_panel_test`)
  + Redis

## Commands

```bash
docker compose up -d postgres redis     # local infra
npm install                             # workspaces
cd packages/backend && npm run migrate  # apply migrations
npm run dev                             # both apps
npm run test && npm run lint            # full verification
cd packages/backend && npm run typecheck
cd packages/frontend && npx next build
```

Backend tests need Postgres + Redis running; `src/test/globalSetup.ts`
recreates `admin_panel_test` automatically. Tests run with `TZ=UTC`.

## Rules for changes

- **Safety-critical code** (`services/ai/piiStripper.ts`,
  `services/ai/outputFilter.ts`, auth middleware, audit chain): preserve the
  fail-closed semantics. Never send unstripped text to an LLM; never ship
  unfiltered LLM output to the dashboard.
- **All LLM output** is advisory framing for physician review — do not add
  endpoints that commit AI content without doctor action.
- **Migrations** must stay idempotent (`IF NOT EXISTS`, `DROP ... IF EXISTS`)
  and ship with a `*_rollback.sql`.
- **Tests**: fix tests to match real behavior changes; do not weaken
  assertions to force a pass.
- **No new top-level implementations.** `packages/` is the only codebase.
- Keep route modules under ~150 lines as layering lands (Phase 2 target).

## Git

- Conventional short commit messages; phase work in separate commits.
- Do not push or tag without being asked.
