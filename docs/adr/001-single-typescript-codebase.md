# ADR-001: Single TypeScript codebase (Express + Next.js)

## Status
Accepted — supersedes the Python/FastAPI prototype

## Context
Two implementations existed: `clinical-ai/` (Python/FastAPI, prototype)
and `packages/` (TypeScript Express + Next.js). The prototype was
faster to iterate but lacked the layered structure, test coverage, and
deployment surface of `packages/`.

## Decision
`packages/` is the only codebase. `clinical-ai/` deleted in Phase 1
after porting its safety-critical pieces (PII stripper, output filter,
fallback semantics) into `src/services/ai/`.

## Consequences
- One runtime, one test suite, one deploy path
- Safety semantics preserved via `docs/PORT-NOTES.md` contracts
- No dual maintenance burden
