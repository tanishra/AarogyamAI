-- Migration 020: consolidate audit_logs dual clocks
-- `timestamp` is canonical (indexed, used by all reads/writes).
-- `created_at` was a redundant DEFAULT NOW() column never read.

ALTER TABLE audit_logs DROP COLUMN IF EXISTS created_at;
