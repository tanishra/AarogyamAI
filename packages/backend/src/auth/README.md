# Authentication and Authorization Module

This module provides JWT-based authentication and role-based authorization for the Admin Panel backend.

## Features

- **JWT Token Generation**: Access tokens (8-hour expiration) and refresh tokens (30-day expiration)
- **Token Verification**: Secure verification with HS256 algorithm
- **Session Management**: Redis-backed session storage with 8-hour TTL
- **Token Blacklisting**: Logout support via token blacklist
- **Authentication Middleware**: Extract and verify JWT from requests
- **Authorization Middleware**: Role-based access control

## Components

### JWT (`jwt.ts`)

Handles token generation and verification.

```typescript
import { generateTokenPair, verifyAccessToken } from './auth';

// Generate tokens
const tokens = generateTokenPair({
  userId: 'user-123',
  email: 'admin@example.com',
  role: 'Administrator',
});

// Verify access token
const payload = verifyAccessToken(tokens.accessToken);
```

### Session Management (`session.ts`)

Manages user sessions in Redis.

```typescript
import { createSession, invalidateSession } from './auth';

// Create session
await createSession('session-id', {
  userId: 'user-123',
  role: 'Administrator',
  email: 'admin@example.com',
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0',
});

// Invalidate session
await invalidateSession('session-id');

// Invalidate all user sessions (e.g., on role change)
await invalidateUserSessions('user-123');
```

### Authentication Middleware (`authMiddleware.ts`)

Verifies JWT tokens and attaches user to request.

```typescript
import { authenticate } from './auth';
import { AuditLogRepository } from '../repositories';

const auditLogRepo = new AuditLogRepository();

// Apply to routes
app.use('/api/admin', authenticate({ auditLogRepo }));

// Access user in route handler
app.get('/api/admin/profile', (req, res) => {
  console.log(req.user); // TokenPayload
});
```

### Authorization Middleware (`authorizationMiddleware.ts`)

Enforces role-based access control.

```typescript
import { requireAdministrator, requireDPO, authorize } from './auth';

// Administrator-only route
app.get('/api/admin/users', requireAdministrator(auditLogRepo), handler);

// DPO-only route
app.get('/api/consent/records', requireDPO(auditLogRepo), handler);

// Custom roles
app.get('/api/custom', authorize({
  allowedRoles: ['Administrator', 'DPO'],
  auditLogRepo,
}), handler);
```

## Usage Example

Complete authentication flow:

```typescript
import express from 'express';
import {
  generateTokenPair,
  createSession,
  authenticate,
  requireAdministrator,
} from './auth';

const app = express();

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
  // Validate credentials (not shown)
  const user = { userId: '123', email: 'admin@example.com', role: 'Administrator' };
  
  // Generate tokens
  const tokens = generateTokenPair(user);
  
  // Create session
  const sessionId = crypto.randomUUID();
  await createSession(sessionId, {
    ...user,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
  });
  
  res.json({
    ...tokens,
    sessionId,
  });
});

// Protected routes
app.use('/api/admin', authenticate());
app.get('/api/admin/users', requireAdministrator(), (req, res) => {
  res.json({ users: [] });
});
```

## Security Considerations

1. **Token Storage**: Tokens should be stored in memory on the client (not localStorage)
2. **HTTPS Only**: All authentication endpoints must use HTTPS
3. **Token Rotation**: Implement refresh token rotation for enhanced security
4. **Session Invalidation**: Sessions are automatically invalidated on:
   - User logout
   - Role changes
   - Account deactivation
5. **Audit Logging**: All authentication failures are logged for security monitoring

## Configuration

Environment variables (in `config/index.ts`):

```bash
JWT_SECRET=your-secret-key
JWT_REFRESH_SECRET=your-refresh-secret
JWT_ACCESS_EXPIRATION=8h
JWT_REFRESH_EXPIRATION=30d
SESSION_TTL=28800  # 8 hours in seconds
REDIS_URL=redis://localhost:6379
```

## Testing

Run tests:

```bash
npm test -- src/auth
```

Tests cover:
- Token generation and verification
- Session management (create, get, invalidate, refresh)
- Token blacklisting
- Authentication middleware
- Authorization middleware
- Role-based access control
