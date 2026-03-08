-- Rollback Migration: 004_create_mfa_configurations_table
-- Description: Drop MFA configurations table and related indexes

-- Drop indexes
DROP INDEX IF EXISTS idx_mfa_method;
DROP INDEX IF EXISTS idx_mfa_enabled;
DROP INDEX IF EXISTS idx_mfa_user_id;

-- Drop table
DROP TABLE IF EXISTS mfa_configurations;
