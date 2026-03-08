-- Migration: 014_create_clinical_reasoning_versions_table
-- Description: Create clinical_reasoning_versions table for tracking changes to clinical reasoning traces
-- Requirements: 12.1, 12.4, 12.7

-- Create clinical_reasoning_versions table
CREATE TABLE IF NOT EXISTS clinical_reasoning_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL,
  version_number INTEGER NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  user_name VARCHAR(255),
  user_role VARCHAR(50),
  change_type VARCHAR(50) CHECK (change_type IN ('differential-added', 'differential-removed', 'differential-modified', 'differential-reordered', 'reasoning-updated', 'evidence-added', 'evidence-removed')),
  change_summary TEXT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(encounter_id, version_number)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_cr_versions_encounter_id ON clinical_reasoning_versions(encounter_id);
CREATE INDEX IF NOT EXISTS idx_cr_versions_created_at ON clinical_reasoning_versions(created_at);
CREATE INDEX IF NOT EXISTS idx_cr_versions_user_id ON clinical_reasoning_versions(user_id);

-- Add comments for documentation
COMMENT ON TABLE clinical_reasoning_versions IS 'Stores version history of clinical reasoning traces with complete snapshots';
COMMENT ON COLUMN clinical_reasoning_versions.id IS 'Unique identifier for the version record';
COMMENT ON COLUMN clinical_reasoning_versions.encounter_id IS 'Reference to the clinical encounter (session)';
COMMENT ON COLUMN clinical_reasoning_versions.version_number IS 'Sequential version number for this encounter';
COMMENT ON COLUMN clinical_reasoning_versions.user_id IS 'User ID of the person who made the change';
COMMENT ON COLUMN clinical_reasoning_versions.user_name IS 'Name of the user who made the change (denormalized for history)';
COMMENT ON COLUMN clinical_reasoning_versions.user_role IS 'Role of the user who made the change (denormalized for history)';
COMMENT ON COLUMN clinical_reasoning_versions.change_type IS 'Type of change made to the clinical reasoning';
COMMENT ON COLUMN clinical_reasoning_versions.change_summary IS 'Human-readable summary of the changes made';
COMMENT ON COLUMN clinical_reasoning_versions.snapshot IS 'Complete snapshot of the clinical reasoning state at this version';
COMMENT ON COLUMN clinical_reasoning_versions.created_at IS 'Timestamp when this version was created';
