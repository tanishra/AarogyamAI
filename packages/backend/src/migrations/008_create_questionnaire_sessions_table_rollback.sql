-- Rollback: 008_create_questionnaire_sessions_table
-- Description: Drop questionnaire_sessions table

-- Drop indexes
DROP INDEX IF EXISTS idx_questionnaire_sessions_last_activity;
DROP INDEX IF EXISTS idx_questionnaire_sessions_patient_id;

-- Drop table
DROP TABLE IF EXISTS questionnaire_sessions;
