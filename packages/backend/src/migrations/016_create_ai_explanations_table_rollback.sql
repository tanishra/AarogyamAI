-- Rollback: 016_create_ai_explanations_table
-- Description: Drop ai_explanations table and related triggers

-- Drop trigger
DROP TRIGGER IF EXISTS update_ai_explanations_updated_at ON ai_explanations;

-- Drop indexes
DROP INDEX IF EXISTS idx_ai_explanations_generated_at;
DROP INDEX IF EXISTS idx_ai_explanations_differential_id;

-- Drop table
DROP TABLE IF EXISTS ai_explanations;
