# Backend Types

TypeScript type definitions and Zod schemas for the AarogyamAI backend.

## Files

### audit-log.ts

Defines the audit log schema:

- **Zod validation schema** (`AuditLogSchema`) for runtime type checking
- **TypeScript types** (`AuditLogItem`, `CreateAuditLogInput`) for compile-time safety
- **Action type constants** (`AuditActionTypes`) for consistent action naming
- **Resource type constants** (`AuditResourceTypes`) for consistent resource naming

The backing store is PostgreSQL `audit_logs`, hash-chained for
tamper-evidence (see `repositories/AuditLogRepository` and
`lib/auditHash` / `verifyIntegrity`).

### audit-log.test.ts

Test suite for the audit log schema: validates correct entries, rejects
invalid data (wrong types, missing fields, invalid formats), tests
optional-field handling, and covers action/resource type constants.

```bash
npm test -- audit-log.test.ts
```

## Usage

```typescript
import {
  AuditLogItem,
  AuditLogSchema,
  CreateAuditLogInput,
  AuditActionTypes,
  AuditResourceTypes,
} from './types/audit-log';
```

Writing an entry goes through the repository, which handles hash
chaining inside a transaction:

```typescript
await auditLogRepository.create({
  userId,
  userName: maskEmail(user.email),
  userRole: user.role,
  actionType: AuditActionTypes.USER_CREATED,
  resource: AuditResourceTypes.USER,
  outcome: 'success',
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'] ?? 'unknown',
  requestId: req.id,
});
```

## Testing

All type definitions are tested with Vitest:

```bash
npm test                # full suite
npm test -- audit-log   # schema tests only
npm run test:watch      # watch mode
```
