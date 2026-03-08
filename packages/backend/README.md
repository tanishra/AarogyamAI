# Admin Panel Backend - MVP

This is the backend API for the AI-Assisted Clinical Reasoning System Admin Panel.

## Features Implemented (MVP)

### Authentication & Authorization
- JWT-based authentication (HS256)
- Access tokens (8-hour expiration)
- Refresh tokens (30-day expiration)
- Redis-backed session management
- Token blacklisting for logout
- Role-based authorization middleware

### User Management
- Registration request approval/rejection workflow
- User CRUD operations
- Role management with session invalidation
- Account activation/deactivation
- Password reset initiation
- MFA management (enable/disable/re-enroll)
- User activity history

### Metrics (Mock Data for MVP)
- Consultation metrics
- Active user metrics
- AI acceptance rate
- Preparation time metrics
- Questionnaire completion metrics
- Dashboard summary

### Audit Logging
- DynamoDB-backed audit log storage
- Comprehensive event tracking
- Search and filtering
- Access pattern analysis (mock)
- Anomaly detection (mock)
- Integrity verification (mock)
- Log export (mock)

### Consent & Grievance Management
- Consent record management
- Consent withdrawal processing
- Grievance tracking and resolution
- Data access request fulfillment
- Compliance report generation (mock)

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Databases**: 
  - PostgreSQL (user data, consent, grievances)
  - DynamoDB (audit logs)
  - Redis (sessions, caching)
- **Authentication**: JWT (jsonwebtoken)
- **Validation**: Zod
- **Testing**: Vitest
- **ORM**: Raw SQL with pg library

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+
- Redis 6+
- AWS credentials (for DynamoDB) or DynamoDB Local

### Installation

```bash
cd packages/backend
npm install
```

### Environment Variables

Create a `.env` file:

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=admin_panel
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# DynamoDB
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
DYNAMODB_TABLE_NAME=audit_logs

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_ACCESS_EXPIRATION=8h
JWT_REFRESH_EXPIRATION=30d

# Session
SESSION_TTL=28800
```

### Database Setup

1. Create PostgreSQL database:

```bash
createdb admin_panel
```

2. Run migrations:

```bash
npm run migrate:up
```

3. Create DynamoDB table (see `src/config/DYNAMODB_SETUP.md`)

### Development

```bash
npm run dev
```

Server runs on [http://localhost:3001](http://localhost:3001)

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Build

```bash
npm run build
npm start
```

## Project Structure

```
src/
├── auth/                  # Authentication & authorization
│   ├── jwt.ts            # JWT token generation/verification
│   ├── session.ts        # Redis session management
│   ├── authMiddleware.ts # Authentication middleware
│   └── authorizationMiddleware.ts # Role-based authorization
├── config/               # Configuration
│   ├── database.ts       # PostgreSQL connection
│   ├── redis.ts          # Redis client
│   └── dynamodb.ts       # DynamoDB client
├── migrations/           # Database migrations
│   ├── 001_create_user_management_tables.sql
│   ├── 002_create_consent_grievance_tables.sql
│   └── migrate.ts        # Migration runner
├── repositories/         # Data access layer
│   ├── UserRepository.ts
│   ├── RegistrationRequestRepository.ts
│   ├── AuditLogRepository.ts
│   ├── ConsentRepository.ts
│   ├── GrievanceRepository.ts
│   └── DataAccessRequestRepository.ts
├── routes/              # API routes
│   ├── auth.ts          # Authentication endpoints
│   ├── userManagement.ts # User management endpoints
│   ├── metrics.ts       # Metrics endpoints
│   ├── audit.ts         # Audit log endpoints
│   └── consent.ts       # Consent & grievance endpoints
├── services/            # Business logic
│   └── UserManagementService.ts
├── types/               # TypeScript types
│   └── audit-log.ts
└── index.ts             # Express app entry point
```

## API Endpoints

### Authentication (`/api/admin/auth`)

- `POST /login` - Login with email/password
- `POST /logout` - Logout and invalidate session
- `POST /refresh` - Refresh access token
- `POST /mfa-verify` - Verify MFA code (placeholder)

### User Management (`/api/admin`)

**Registration Requests:**
- `GET /registration-requests` - Get pending requests
- `POST /registration-requests/:id/approve` - Approve request
- `POST /registration-requests/:id/reject` - Reject request

**Users:**
- `GET /users` - List users (paginated)
- `GET /users/:id` - Get user details
- `PUT /users/:id/role` - Change user role
- `PUT /users/:id/status` - Activate/deactivate user
- `POST /users/:id/password-reset` - Initiate password reset
- `PUT /users/:id/mfa` - Update MFA settings
- `GET /users/:id/activity` - Get user activity history

### Metrics (`/api/metrics`)

- `GET /consultations` - Consultation metrics
- `GET /active-users` - Active user metrics
- `GET /ai-acceptance` - AI acceptance rate
- `GET /preparation-time` - Preparation time metrics
- `GET /questionnaire-completion` - Questionnaire completion metrics
- `GET /dashboard-summary` - Complete dashboard summary

### Audit Logs (`/api/audit`)

- `GET /logs` - Search audit logs
- `GET /logs/:id` - Get single log entry
- `GET /access-patterns/:patientId` - Access pattern analysis (mock)
- `GET /anomalies` - Anomaly alerts (mock)
- `POST /anomalies/:id/acknowledge` - Acknowledge anomaly (mock)
- `POST /verify` - Verify log integrity (mock)
- `POST /export` - Export logs (mock)

### Consent & Grievances (`/api`)

- `GET /consent/records` - Get consent records
- `GET /consent/withdrawal-requests` - Get pending withdrawals
- `POST /consent/withdrawal-requests/:id/process` - Process withdrawal
- `GET /grievances` - Get grievances
- `PUT /grievances/:id` - Update grievance status
- `GET /data-access-requests` - Get data access requests
- `PUT /data-access-requests/:id/fulfill` - Fulfill request
- `POST /compliance/reports` - Generate compliance report (mock)

## Authentication Flow

1. Client sends credentials to `/api/admin/auth/login`
2. Server validates credentials and checks role (Administrator/DPO only)
3. Server creates Redis session and generates JWT tokens
4. Client receives access token and refresh token
5. Client includes access token in `Authorization: Bearer <token>` header
6. Server validates token and checks session on each request
7. On token expiration, client refreshes using `/api/admin/auth/refresh`

## Authorization

- **Administrator**: User management, metrics
- **DPO**: Consent management, grievances, data access requests, compliance reports
- **Both**: Audit logs

## Database Schema

### PostgreSQL Tables

**registration_requests**
- Stores pending registration requests
- Includes applicant info, credentials, status

**users** (extends existing table)
- User accounts with roles
- MFA settings
- Account status

**consent_records**
- Patient consent records
- Data categories and processing purposes
- Withdrawal tracking

**grievances**
- Patient grievances
- Status tracking
- DPO notes

**data_access_requests**
- Patient data access requests
- Fulfillment tracking

### DynamoDB Table

**audit_logs**
- Partition key: userId
- Sort key: timestamp
- GSIs for actionType, resource, timestamp queries

### Redis Keys

- `session:{userId}` - User session data (8h TTL)
- `blacklist:{token}` - Blacklisted tokens (TTL = token expiration)

## Testing

The project includes comprehensive unit tests:

- JWT tests (22 tests)
- Session management tests (20 tests)
- Middleware tests (12 tests)
- Repository tests (34 tests)
- Service tests (14 tests)
- Route tests (60+ tests)

Total: 160+ tests passing

Run `npm test` to execute all tests.

## Migrations

### Run Migrations

```bash
# Run all pending migrations
npm run migrate:up

# Rollback last migration
npm run migrate:down

# Check migration status
npm run migrate:status
```

### Create New Migration

1. Create SQL file in `src/migrations/`
2. Follow naming convention: `XXX_description.sql`
3. Create corresponding rollback file: `XXX_description_rollback.sql`

## Error Handling

The API uses standard HTTP status codes:

- `200` - Success
- `400` - Bad Request (validation error)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (e.g., duplicate email)
- `500` - Internal Server Error

Error responses include:
```json
{
  "error": "Error Type",
  "message": "Human-readable error message",
  "details": {} // Optional validation details
}
```

## Audit Logging

All state-changing operations create audit log entries:

- User authentication (success/failure)
- User management actions
- Role changes
- Account status changes
- Consent withdrawals
- Grievance updates
- Data access request fulfillment

Audit logs include:
- User ID, name, role
- Action type and resource
- Outcome (success/failure)
- IP address and user agent
- Timestamp
- Hash for tamper detection

## Security

- Passwords hashed with bcrypt (cost factor 10)
- JWT tokens signed with HS256
- Session data encrypted in Redis
- SQL injection prevention (parameterized queries)
- Input validation with Zod
- Rate limiting (TODO)
- CORS configuration (TODO)

## Coming Soon

- Full MFA implementation (TOTP/SMS)
- Real anomaly detection algorithms
- Real access pattern analysis
- Log integrity verification with blockchain
- Email notifications (currently mock console.log)
- Rate limiting
- Request logging middleware
- CloudWatch integration

## Troubleshooting

### Database connection errors

- Verify PostgreSQL is running: `pg_isready`
- Check credentials in `.env`
- Ensure database exists: `psql -l`

### Redis connection errors

- Verify Redis is running: `redis-cli ping`
- Check Redis host/port in `.env`

### DynamoDB errors

- Verify AWS credentials
- Check table exists: `aws dynamodb list-tables`
- For local development, use DynamoDB Local

### Migration errors

- Check migration files for syntax errors
- Verify database connection
- Check migration status: `npm run migrate:status`

## License

Proprietary - All rights reserved
