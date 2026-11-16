# ADR-003: PostgreSQL hash-chain as authoritative audit store

## Status
Accepted

## Context
`AuditLogRepository.create` previously wrote only to DynamoDB and
silently no-oped when DynamoDB was unconfigured — audit logging was
effectively absent in dev/staging. Hash computation differed between
writer and verifier (`undefined` vs `null` serialization) so verify
flagged every row.

## Decision
- PostgreSQL `audit_logs` is the authoritative store; DynamoDB is an
  optional mirror for query performance
- `lib/auditHash.ts` canonicalizes fields (sorted keys, `undefined`→null)
  so writer and `verifyIntegrity` produce identical digests
- Chain tip read with `FOR UPDATE` inside a transaction — concurrent
  writers cannot fork the chain
- `verifyIntegrity` recomputes hashes + previous-hash links; tampered
  rows are flagged

## Consequences
- Audit survives without AWS; tamper-evidence is real, not decorative
- Hash canonicalization is load-bearing — do not change field order or
  null handling without a migration of existing hashes
