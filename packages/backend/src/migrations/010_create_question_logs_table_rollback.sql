-- Rollback: 010_create_question_logs_table
-- Description: Drop question_logs table

-- Drop index
DROP INDEX IF EXISTS idx_question_logs_session_id;

-- Drop table
DROP TABLE IF EXISTS question_logs;
