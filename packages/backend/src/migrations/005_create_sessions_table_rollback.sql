-- Rollback Migration: 005_create_sessions_table
-- Description: Drop sessions table and related indexes

-- Drop indexes
DROP INDEX IF EXISTS idx_sessions_active;
DROP INDEX IF EXISTS idx_sessions_last_activity;
DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_sessions_token_hash;
DROP INDEX IF EXISTS idx_sessions_user_id;

-- Drop table
DROP TABLE IF EXISTS sessions;
