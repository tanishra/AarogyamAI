-- Rollback: 014_create_clinical_reasoning_versions_table
-- Description: Drop clinical_reasoning_versions table and related indexes

-- Drop indexes
DROP INDEX IF EXISTS idx_cr_versions_user_id;
DROP INDEX IF EXISTS idx_cr_versions_created_at;
DROP INDEX IF EXISTS idx_cr_versions_encounter_id;

-- Drop table
DROP TABLE IF EXISTS clinical_reasoning_versions;
