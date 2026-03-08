-- Rollback Migration: 006_create_privacy_notices_tables
-- Description: Drop privacy notices and acknowledgments tables and related indexes

-- Drop indexes
DROP INDEX IF EXISTS idx_privacy_ack_user_notice;
DROP INDEX IF EXISTS idx_privacy_ack_notice_id;
DROP INDEX IF EXISTS idx_privacy_ack_user_id;
DROP INDEX IF EXISTS idx_privacy_notices_active;
DROP INDEX IF EXISTS idx_privacy_notices_version;

-- Drop tables (acknowledgments first due to foreign key)
DROP TABLE IF EXISTS privacy_notice_acknowledgments;
DROP TABLE IF EXISTS privacy_notices;
