-- Rollback: 011_create_family_history_table
-- Description: Drop family_history table

-- Drop indexes
DROP INDEX IF EXISTS idx_family_history_hereditary_flag;
DROP INDEX IF EXISTS idx_family_history_category;
DROP INDEX IF EXISTS idx_family_history_patient_id;

-- Drop table
DROP TABLE IF EXISTS family_history;
