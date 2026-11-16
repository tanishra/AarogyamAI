# ADR-002: Composition root + layered architecture

## Status
Accepted

## Context
Routes contained raw SQL, `new` service instantiation, and scattered
`process.env` reads — untestable, violating SOLID.

## Decision
- `routes/` thin: auth, validation, envelope
- `services/` business logic, constructor-injected deps
- `repositories/` all SQL
- `src/composition.ts` builds pool, repos, services once; routes pull
  from `getContainer()`
- Zod-validated `config/`; winston logger; typed `AppError` +
  `asyncHandler`

## Consequences
- Every dependency replaceable in tests (mocked at module/class level)
- Route modules stay small; SQL lives in one layer
- Contract tests pin `{ message, data }` / `{ error, message }` envelopes
