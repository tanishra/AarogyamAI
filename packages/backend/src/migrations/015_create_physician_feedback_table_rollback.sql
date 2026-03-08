-- Rollback: 015_create_physician_feedback_table
-- Description: Drop physician_feedback table and related triggers

-- Drop trigger
DROP TRIGGER IF EXISTS update_physician_feedback_updated_at ON physician_feedback;

-- Drop indexes
DROP INDEX IF EXISTS idx_physician_feedback_created_at;
DROP INDEX IF EXISTS idx_physician_feedback_rating;
DROP INDEX IF EXISTS idx_physician_feedback_physician_id;
DROP INDEX IF EXISTS idx_physician_feedback_differential_id;

-- Drop table
DROP TABLE IF EXISTS physician_feedback;
