# Database Migrations

This directory contains PostgreSQL migration scripts for the Admin Panel backend.

## Overview

Migrations are SQL scripts that modify the database schema. Each migration has:
- A forward migration file (e.g., `001_create_user_management_tables.sql`)
- A rollback migration file (e.g., `001_create_user_management_tables_rollback.sql`)

## Migration Naming Convention

Migrations follow the pattern: `{number}_{description}.sql`

- **Number**: Three-digit sequential number (001, 002, 003, etc.)
- **Description**: Snake_case description of what the migration does

## Running Migrations

### Prerequisites

Set up your database connection environment variables:

```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=admin_panel
export DB_USER=postgres
export DB_PASSWORD=your_password
```

Or create a `.env` file in the backend package root:

```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=admin_panel
DB_USER=postgres
DB_PASSWORD=your_password
```

### Commands

**Run all pending migrations:**
```bash
npm run migrate:up
```

**Check migration status:**
```bash
npm run migrate:status
```

**Rollback a specific migration:**
```bash
npm run migrate:down 001_create_user_management_tables.sql
```

## Migration Tracking

The migration system automatically creates a `schema_migrations` table to track which migrations have been applied. This table contains:
- `id`: Auto-incrementing primary key
- `migration_name`: Name of the migration file
- `applied_at`: Timestamp when the migration was applied

## Creating New Migrations

1. Create a new migration file with the next sequential number:
   ```
   002_your_migration_name.sql
   ```

2. Create the corresponding rollback file:
   ```
   002_your_migration_name_rollback.sql
   ```

3. Add the migration to the `MIGRATIONS` array in:
   - `run-migrations.ts`
   - `migrate.ts`

4. Test your migration:
   ```bash
   npm run migrate:up
   npm run migrate:status
   npm run migrate:down 002_your_migration_name.sql
   ```

## Current Migrations

### 001_create_user_management_tables.sql

**Purpose**: Create user management tables for the admin panel

**Changes**:
- Creates `registration_requests` table for healthcare professional registration requests
- Extends `users` table with admin panel columns:
  - `is_active`: Account activation status
  - `mfa_enabled`: Multi-factor authentication flag
  - `mfa_method`: MFA method type (totp/sms)
  - `mfa_secret`: Encrypted MFA secret
  - `last_password_change`: Password change timestamp
  - `last_mfa_verification`: Last MFA verification timestamp
- Creates indexes for performance:
  - `idx_registration_requests_status`
  - `idx_registration_requests_submitted_at`
  - `idx_users_role`
  - `idx_users_is_active`

**Requirements**: 1.1, 2.1, 3.1, 6.1

### 002_create_consent_grievance_tables.sql

**Purpose**: Create consent management and grievance tracking tables for DPO functionality

**Changes**:
- Creates `consent_records` table for patient consent tracking:
  - Stores consent type, data categories, processing purposes
  - Tracks consent status (active, withdrawn, expired)
  - Includes grant and expiration timestamps
- Creates `consent_withdrawal_requests` table for withdrawal request management:
  - Links to consent records and patients
  - Tracks processing status and DPO who processed
- Creates `grievances` table for patient complaint tracking:
  - Stores grievance description and affected data
  - Tracks status (pending, investigating, resolved, escalated)
  - Includes DPO notes and resolution information
- Creates `data_access_requests` table for patient data rights:
  - Supports data_copy, data_correction, data_deletion request types
  - Tracks fulfillment status and response documents
- Creates indexes for performance:
  - Foreign key indexes on all patient_id columns
  - Status indexes for filtering
  - Timestamp indexes for date-based queries

**Requirements**: 17.1, 18.1, 19.1, 20.1

### 003_create_ai_chat_tables.sql

**Purpose**: Create tables for AI chat functionality

**Changes**:
- Creates tables for AI-powered chat interactions
- Stores conversation history and context
- Tracks AI model responses and user interactions

**Requirements**: AI chat functionality

### 004_create_mfa_configurations_table.sql

**Purpose**: Create MFA configurations table for TOTP and SMS authentication with encrypted secrets

**Changes**:
- Creates `mfa_configurations` table for multi-factor authentication:
  - Supports TOTP (Time-based One-Time Password) and SMS authentication methods
  - Stores encrypted TOTP secrets for code generation
  - Stores encrypted phone numbers for SMS-based authentication
  - Includes encrypted backup codes array for account recovery
  - Tracks enabled/verified status for each MFA method
  - Enforces unique constraint on (user_id, method) combination
- Creates indexes for performance:
  - `idx_mfa_user_id`: Fast lookup by user
  - `idx_mfa_enabled`: Filter by enabled status
  - `idx_mfa_method`: Filter by authentication method
- Includes comprehensive documentation comments for all columns

**Requirements**: 13.1, 13.2, 13.3, 13.4, 13.5

### 005_create_sessions_table.sql

**Purpose**: Create sessions table with activity tracking for session timeout management

**Changes**:
- Creates `sessions` table for user authentication session management:
  - Stores session metadata including IP address, user agent, and device type
  - Tracks MFA verification status for each session
  - Includes activity tracking with created_at, last_activity, and expires_at timestamps
  - Supports session termination tracking with terminated_at and termination_reason
  - Uses token_hash for secure session identification with unique constraint
  - Foreign key to users table with CASCADE delete
- Creates indexes for performance:
  - `idx_sessions_user_id`: Fast lookup by user
  - `idx_sessions_token_hash`: Fast session validation by token
  - `idx_sessions_expires_at`: Efficient expiration checking
  - `idx_sessions_last_activity`: Activity-based queries for timeout detection
  - `idx_sessions_active`: Composite index for active session queries (user_id, expires_at) with partial index on non-terminated sessions
- Includes comprehensive documentation comments for all columns

**Requirements**: 14.1, 14.2, 14.6

## Best Practices

1. **Always test migrations** in a development environment before production
2. **Keep migrations small** and focused on a single logical change
3. **Write rollback scripts** for every migration
4. **Use transactions** - migrations run within BEGIN/COMMIT blocks
5. **Use IF NOT EXISTS** clauses to make migrations idempotent
6. **Document your changes** with comments in the SQL files
7. **Never modify existing migrations** that have been applied to production

## Troubleshooting

### Migration fails with "relation already exists"

This usually means the migration was partially applied. Check the database state and either:
- Manually clean up the partial changes
- Use the rollback script to undo changes
- Modify the migration to use `IF NOT EXISTS` clauses

### Cannot connect to database

Verify your environment variables are set correctly:
```bash
npm run migrate:status
```

If you see connection errors, check:
- Database is running
- Host and port are correct
- User has necessary permissions
- Database exists

### Migration tracking table issues

If the `schema_migrations` table gets corrupted, you can manually fix it:

```sql
-- View current migrations
SELECT * FROM schema_migrations;

-- Manually add a migration record
INSERT INTO schema_migrations (migration_name) VALUES ('001_create_user_management_tables.sql');

-- Remove a migration record
DELETE FROM schema_migrations WHERE migration_name = '001_create_user_management_tables.sql';
```
