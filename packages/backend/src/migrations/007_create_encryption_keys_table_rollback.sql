-- Rollback: 007_create_encryption_keys_table
-- Description: Drop encryption_keys table

-- Drop indexes
DROP INDEX IF EXISTS idx_encryption_keys_active;
DROP INDEX IF EXISTS idx_encryption_keys_rotation_date;
DROP INDEX IF EXISTS idx_encryption_keys_status;
DROP INDEX IF EXISTS idx_encryption_keys_key_id;

-- Drop table
DROP TABLE IF EXISTS encryption_keys;
