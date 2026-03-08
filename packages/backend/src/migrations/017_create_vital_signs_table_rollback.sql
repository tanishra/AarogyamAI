-- Rollback: 017_create_vital_signs_table
-- Description: Drop vital_signs table and related triggers

-- Drop trigger
DROP TRIGGER IF EXISTS update_vital_signs_updated_at ON vital_signs;

-- Drop indexes
DROP INDEX IF EXISTS idx_vital_signs_patient_recorded;
DROP INDEX IF EXISTS idx_vital_signs_recorded_at;
DROP INDEX IF EXISTS idx_vital_signs_encounter_id;
DROP INDEX IF EXISTS idx_vital_signs_patient_id;

-- Drop table
DROP TABLE IF EXISTS vital_signs;
