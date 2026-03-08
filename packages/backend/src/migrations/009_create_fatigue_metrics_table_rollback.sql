-- Rollback: 009_create_fatigue_metrics_table
-- Description: Drop fatigue_metrics table

-- Drop index
DROP INDEX IF EXISTS idx_fatigue_metrics_session_id;

-- Drop table
DROP TABLE IF EXISTS fatigue_metrics;
