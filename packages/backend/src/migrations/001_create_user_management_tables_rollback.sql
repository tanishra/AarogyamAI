-- Rollback Migration: 001_create_user_management_tables
-- Description: Rollback user management tables and columns

-- Drop indexes for users table
DROP INDEX IF EXISTS idx_users_is_active;
DROP INDEX IF EXISTS idx_users_role;

-- Remove columns from users table
ALTER TABLE users DROP COLUMN IF EXISTS last_mfa_verification;
ALTER TABLE users DROP COLUMN IF EXISTS last_password_change;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_secret;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_method;
ALTER TABLE users DROP COLUMN IF EXISTS mfa_enabled;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;

-- Drop indexes for registration_requests
DROP INDEX IF EXISTS idx_registration_requests_submitted_at;
DROP INDEX IF EXISTS idx_registration_requests_status;

-- Drop registration_requests table
DROP TABLE IF EXISTS registration_requests;
