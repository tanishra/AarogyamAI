-- Rollback: 013_create_differentials_table
-- Description: Drop differentials table and related triggers

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_differentials_modified_at ON differentials;
DROP TRIGGER IF EXISTS update_differentials_updated_at ON differentials;

-- Drop function
DROP FUNCTION IF EXISTS update_differentials_modified_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_differentials_priority;
DROP INDEX IF EXISTS idx_differentials_added_by;
DROP INDEX IF EXISTS idx_differentials_source;
DROP INDEX IF EXISTS idx_differentials_patient_id;
DROP INDEX IF EXISTS idx_differentials_encounter_id;

-- Drop table
DROP TABLE IF EXISTS differentials;
