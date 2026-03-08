# Services Layer

This directory contains the business logic services for the Admin Panel backend.

## UserManagementService

The `UserManagementService` implements core user management operations for administrators.

### Features

#### 1. Registration Request Approval/Rejection

- **approveRegistration**: Approves a pending registration request and creates a user account
  - Validates request exists and is pending
  - Creates user account with temporary password (atomic transaction)
  - Creates audit log entry
  - Sends email notification (mock for MVP)
  - Prevents duplicate processing (409 conflict)

- **rejectRegistration**: Rejects a pending registration request
  - Validates request exists and is pending
  - Stores rejection reason
  - Creates audit log entry
  - Sends email notification (mock for MVP)

#### 2. User Role Management

- **changeUserRole**: Changes a user's role and invalidates all active sessions
  - Prevents self-demotion (administrators cannot change their own role)
  - Updates user role in database
  - Invalidates all active sessions for the user
  - Creates audit log entry with previous and new roles

#### 3. Account Activation/Deactivation

- **deactivateAccount**: Deactivates a user account
  - Prevents self-deactivation (administrators cannot deactivate their own account)
  - Sets `is_active` to false
  - Terminates all active sessions
  - Creates audit log entry with reason

- **activateAccount**: Activates a previously deactivated user account
  - Sets `is_active` to true
  - Restores authentication capabilities
  - Creates audit log entry

### Security Features

- **Self-Action Prevention**: Administrators cannot change their own role or deactivate their own account
- **Session Invalidation**: Role changes and deactivations automatically invalidate all active sessions
- **Audit Logging**: All operations create audit log entries for compliance
- **Atomic Transactions**: Registration approval uses database transactions to ensure data consistency

### Usage Example

```typescript
import { UserManagementService } from './services';

const service = new UserManagementService();

// Approve registration
const result = await service.approveRegistration({
  registrationRequestId: 'req-123',
  processedBy: 'admin-123',
  processedByName: 'Admin User',
  processedByRole: 'Administrator',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0...',
  requestId: 'http-req-123',
});

// Change user role
const updatedUser = await service.changeUserRole({
  userId: 'user-123',
  newRole: 'Administrator',
  adminId: 'admin-456',
  adminName: 'Super Admin',
  adminRole: 'Administrator',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0...',
  requestId: 'http-req-456',
});

// Deactivate account
const deactivatedUser = await service.deactivateAccount({
  userId: 'user-123',
  adminId: 'admin-456',
  adminName: 'Super Admin',
  adminRole: 'Administrator',
  reason: 'Policy violation',
  ipAddress: '127.0.0.1',
  userAgent: 'Mozilla/5.0...',
  requestId: 'http-req-789',
});
```

### Error Handling

All methods throw descriptive errors for common failure cases:
- `Registration request not found`
- `Registration request already {status}`
- `Cannot change your own role`
- `Cannot deactivate your own account`
- `User not found`
- `User account is already {active|deactivated}`

### Testing

Comprehensive unit tests are provided in `UserManagementService.test.ts`:
- Registration approval and rejection flows
- Role change with session invalidation
- Account activation and deactivation
- Self-action prevention
- Error handling for edge cases

Run tests with:
```bash
npm test -- UserManagementService.test.ts
```

### MVP Limitations

- **Email Notifications**: Currently mocked with console.log statements. In production, integrate with AWS SES or similar email service.
- **Password Generation**: Uses simple random bytes. In production, use a secure password generation library and enforce password policies.
- **Password Hashing**: Mock hash format. In production, use bcrypt with proper salt rounds.

### Future Enhancements

- Password reset functionality (Task 7.4)
- MFA management (Task 7.5)
- User activity history retrieval
- Bulk user operations
- Email template system
- Password policy enforcement
