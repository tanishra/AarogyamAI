-- Rollback: 018_create_critical_alerts_table
-- Description: Drop critical_alerts table and related triggers

-- Drop trigger
DROP TRIGGER IF EXISTS update_critical_alerts_updated_at ON critical_alerts;

-- Drop indexes
DROP INDEX IF EXISTS idx_critical_alerts_patient_unack;
DROP INDEX IF EXISTS idx_critical_alerts_created_at;
DROP INDEX IF EXISTS idx_critical_alerts_acknowledged;
DROP INDEX IF EXISTS idx_critical_alerts_encounter_id;
DROP INDEX IF EXISTS idx_critical_alerts_patient_id;
DROP INDEX IF EXISTS idx_critical_alerts_vital_sign_id;

-- Drop table
DROP TABLE IF EXISTS critical_alerts;
