-- Rollback Migration: 012_create_review_of_systems_table
-- Description: Drop review_of_systems table and related objects

-- Drop trigger
DROP TRIGGER IF EXISTS update_review_of_systems_updated_at ON review_of_systems;

-- Drop indexes
DROP INDEX IF EXISTS idx_ros_patient_id;
DROP INDEX IF EXISTS idx_ros_session_id;
DROP INDEX IF EXISTS idx_ros_system;
DROP INDEX IF EXISTS idx_ros_critical;
DROP INDEX IF EXISTS idx_ros_status;

-- Drop table
DROP TABLE IF EXISTS review_of_systems;
