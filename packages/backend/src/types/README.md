# Backend Types

This directory contains TypeScript type definitions and schemas for the Admin Panel backend.

## Files

### audit-log.ts

Defines the DynamoDB audit log schema with:

- **Zod validation schema** (`AuditLogSchema`) for runtime type checking
- **TypeScript types** (`AuditLogItem`, `CreateAuditLogInput`) for compile-time safety
- **Table configuration** (`AUDIT_LOG_TABLE_CONFIG`) with table name, keys, and GSI definitions
- **Action type constants** (`AuditActionTypes`) for consistent action naming
- **Resource type constants** (`AuditResourceTypes`) for consistent resource naming

**Key Features:**
- Partition key: `userId` (String)
- Sort key: `timestamp` (Number - Unix timestamp in milliseconds)
- GSI 1: `actionType-timestamp-index` for filtering by action type
- GSI 2: `resource-timestamp-index` for filtering by resource
- TTL support for automatic log retention
- Hash chaining for tamper detection

### audit-log.test.ts

Comprehensive test suite for the audit log schema:
- Validates correct audit log entries
- Rejects invalid data (wrong types, missing fields, invalid formats)
- Tests optional fields handling
- Verifies table configuration
- Tests action and resource type constants

**Run tests:**
```bash
npm test -- audit-log.test.ts
```

### audit-log.example.ts

Example code demonstrating:
1. Creating audit log entries with validation
2. Querying logs by user (primary key)
3. Querying logs by action type (GSI)
4. Querying logs by resource (GSI)
5. Creating logs with TTL for automatic deletion
6. Validating data before storage

## Usage

### Import types and schema

```typescript
import { 
  AuditLogItem, 
  AuditLogSchema, 
  CreateAuditLogInput,
  AUDIT_LOG_TABLE_CONFIG,
  AuditActionTypes,
  AuditResourceTypes 
} from './types/audit-log';
```

### Create an audit log entry

```typescript
import { getDynamoDBClient } from '../config/dynamodb';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const client = getDynamoDBClient();

const input: CreateAuditLogInput = {
  userId: '123e4567-e89b-12d3-a456-426614174000',
  userName: 'John Doe',
  userRole: 'Administrator',
  actionType: AuditActionTypes.USER_CREATED,
  resource: AuditResourceTypes.USER,
  outcome: 'success',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  requestId: crypto.randomUUID(),
};

// Add computed fields
const auditLog: AuditLogItem = {
  ...input,
  id: crypto.randomUUID(),
  timestamp: Date.now(),
  hash: computeHash(input), // Implement hash function
};

// Validate
const validated = AuditLogSchema.parse(auditLog);

// Store
await client.send(new PutCommand({
  TableName: AUDIT_LOG_TABLE_CONFIG.tableName('dev'),
  Item: validated,
}));
```

### Query audit logs

```typescript
import { QueryCommand } from '@aws-sdk/lib-dynamodb';

// Query by user
const result = await client.send(new QueryCommand({
  TableName: AUDIT_LOG_TABLE_CONFIG.tableName('dev'),
  KeyConditionExpression: 'userId = :userId',
  ExpressionAttributeValues: { ':userId': userId },
}));

// Query by action type (using GSI)
const result = await client.send(new QueryCommand({
  TableName: AUDIT_LOG_TABLE_CONFIG.tableName('dev'),
  IndexName: 'actionType-timestamp-index',
  KeyConditionExpression: 'actionType = :actionType',
  ExpressionAttributeValues: { ':actionType': 'user.created' },
}));
```

## Related Documentation

- [DynamoDB Setup Guide](../config/DYNAMODB_SETUP.md) - Local and production setup instructions
- [Design Document](.kiro/specs/admin-panel/design.md) - Complete system design
- [Requirements](.kiro/specs/admin-panel/requirements.md) - Requirements 12.1, 27.1

## Testing

All type definitions are tested with Vitest. Run the test suite:

```bash
# Run all tests
npm test

# Run only audit log tests
npm test -- audit-log.test.ts

# Watch mode
npm run test:watch
```

## Next Steps

After setting up the types, you'll need to:

1. Implement the audit log repository (Task 3.3)
2. Implement the audit logging service (Task 5)
3. Integrate audit logging into API endpoints (Task 13)
4. Set up DynamoDB locally or in AWS (see DYNAMODB_SETUP.md)
