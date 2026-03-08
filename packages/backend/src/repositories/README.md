# Repository Layer

This directory contains the data access layer for the Admin Panel backend, implementing the Repository pattern for clean separation of concerns.

## Overview

The repository layer provides a consistent interface for data operations across different storage systems:
- **PostgreSQL** (via `pg`): User management, consent records, grievances, data access requests
- **DynamoDB** (via AWS SDK): Audit logs with high-write throughput
- **Redis** (via `ioredis`): Session management and caching (handled in services layer)

## Repositories

### UserRepository
Manages user accounts with CRUD operations.

**Methods:**
- `findById(id)` - Find user by ID
- `findByEmail(email)` - Find user by email
- `create(userData)` - Create new user
- `update(id, updates)` - Update user fields
- `delete(id)` - Soft delete user (sets is_active to false)
- `search(filters)` - Search users with pagination

### RegistrationRequestRepository
Handles registration request approval workflow.

**Methods:**
- `findPending()` - Get all pending requests
- `findById(id)` - Find request by ID
- `create(data)` - Create new registration request
- `approve(requestId, processedBy, userData)` - Approve request and create user (transactional)
- `reject(requestId, processedBy, reason)` - Reject request with reason
- `findAll(status?)` - Get all requests with optional status filter

### AuditLogRepository
Manages audit logs in DynamoDB with GSI support.

**Methods:**
- `create(entry)` - Create new audit log entry
- `search(filters)` - Search logs with filters (userId, actionType, resource, date range)
- `findByUser(userId, limit)` - Get logs for specific user
- `findByResource(resource, limit)` - Get logs for specific resource

**GSI Indexes:**
- `actionType-timestamp-index` - Query by action type
- `resource-timestamp-index` - Query by resource

### ConsentRepository
Manages patient consent records and withdrawal requests.

**Methods:**
- `findByPatient(patientId)` - Get all consent records for patient
- `findByStatus(status)` - Get records by status (active, withdrawn, expired)
- `findById(id)` - Find consent record by ID
- `create(data)` - Create new consent record
- `update(id, updates)` - Update consent record
- `withdraw(id)` - Withdraw consent
- `findAll(filters?)` - Get all records with optional filters
- `getPendingWithdrawals()` - Get pending withdrawal requests
- `createWithdrawalRequest(data)` - Create withdrawal request
- `processWithdrawalRequest(requestId, processedBy)` - Process withdrawal

### GrievanceRepository
Handles patient grievance tracking.

**Methods:**
- `findAll(status?)` - Get all grievances with optional status filter
- `findById(id)` - Find grievance by ID
- `findByPatient(patientId)` - Get grievances for patient
- `create(data)` - Create new grievance
- `updateStatus(id, status, dpoNotes?, resolvedBy?)` - Update grievance status
- `update(id, updates)` - Update grievance fields
- `delete(id)` - Delete grievance

### DataAccessRequestRepository
Manages patient data access requests.

**Methods:**
- `findPending()` - Get all pending requests
- `findById(id)` - Find request by ID
- `findByPatient(patientId)` - Get requests for patient
- `create(data)` - Create new request
- `fulfill(id, fulfilledBy, responseDocumentUrl?)` - Fulfill request
- `findAll(filters?)` - Get all requests with optional filters
- `findOverdue(hours)` - Find requests pending for more than specified hours
- `update(id, updates)` - Update request fields

## Usage Examples

### Creating a User
```typescript
import { UserRepository } from './repositories';

const userRepo = new UserRepository();
const user = await userRepo.create({
  name: 'John Doe',
  email: 'john@example.com',
  password_hash: 'hashed_password',
  role: 'Doctor',
  is_active: true,
});
```

### Approving Registration Request
```typescript
import { RegistrationRequestRepository } from './repositories';

const regRepo = new RegistrationRequestRepository();
const result = await regRepo.approve(
  requestId,
  adminUserId,
  {
    name: 'Jane Smith',
    email: 'jane@example.com',
    password_hash: 'hashed_password',
    role: 'Nurse',
  }
);
// Returns { request: RegistrationRequest, user: User }
```

### Creating Audit Log
```typescript
import { AuditLogRepository } from './repositories';

const auditRepo = new AuditLogRepository();
const log = await auditRepo.create({
  userId: 'user-123',
  userName: 'John Doe',
  userRole: 'Administrator',
  actionType: 'user.role.change',
  resource: 'user',
  resourceId: 'user-456',
  outcome: 'success',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...',
  requestId: 'req-789',
  hash: 'sha256-hash',
});
```

### Searching Audit Logs
```typescript
const logs = await auditRepo.search({
  userId: 'user-123',
  actionType: 'user.role.change',
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-31'),
  page: 1,
  limit: 50,
});
// Returns PaginatedResult<AuditLogEntry>
```

## Transaction Support

The `RegistrationRequestRepository.approve()` method uses PostgreSQL transactions to ensure atomicity:
1. Update registration request status
2. Create user account
3. Commit both operations or rollback on error

This is implemented using the `transaction()` helper from `config/database.ts`.

## Error Handling

Repositories throw errors for:
- Database connection failures
- Constraint violations (unique email, foreign keys)
- Not found errors (return null instead of throwing)
- Transaction rollback failures

Services layer should handle these errors and convert them to appropriate HTTP responses.

## Testing

Repository tests should use:
- In-memory PostgreSQL (pg-mem) for unit tests
- Local DynamoDB (dynamodb-local) for integration tests
- Test fixtures for consistent test data

See `repositories.test.ts` for examples.

## Performance Considerations

### PostgreSQL
- Connection pooling configured in `config/database.ts`
- Indexes on frequently queried columns (see migration files)
- Pagination for large result sets

### DynamoDB
- GSI indexes for efficient filtering
- Batch operations for bulk writes (not yet implemented)
- Pagination using LastEvaluatedKey (not yet implemented)

### Redis
- TTL for automatic cache expiration
- Key patterns for organized cache structure
- Connection pooling with retry logic

## Future Enhancements

- [ ] Implement batch operations for bulk inserts/updates
- [ ] Add soft delete support for all entities
- [ ] Implement optimistic locking for concurrent updates
- [ ] Add query result caching layer
- [ ] Implement read replicas for PostgreSQL
- [ ] Add DynamoDB streams for audit log processing
