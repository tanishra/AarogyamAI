-- Migration: 013_create_differentials_table
-- Description: Create differentials table for managing differential diagnoses with AI and physician sources
-- Requirements: 8.3, 8.8

-- Create differentials table
CREATE TABLE IF NOT EXISTS differentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id UUID NOT NULL,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  diagnosis_code VARCHAR(20) NOT NULL,
  diagnosis_name VARCHAR(255) NOT NULL,
  diagnosis_category VARCHAR(100),
  priority INTEGER NOT NULL DEFAULT 1,
  supporting_evidence JSONB DEFAULT '[]',
  clinical_reasoning TEXT,
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  source VARCHAR(20) NOT NULL CHECK (source IN ('ai', 'physician')),
  added_by UUID NOT NULL REFERENCES users(id),
  added_at TIMESTAMP NOT NULL DEFAULT NOW(),
  modified_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_differentials_encounter_id ON differentials(encounter_id);
CREATE INDEX IF NOT EXISTS idx_differentials_patient_id ON differentials(patient_id);
CREATE INDEX IF NOT EXISTS idx_differentials_source ON differentials(source);
CREATE INDEX IF NOT EXISTS idx_differentials_added_by ON differentials(added_by);
CREATE INDEX IF NOT EXISTS idx_differentials_priority ON differentials(priority);

-- Add comments for documentation
COMMENT ON TABLE differentials IS 'Stores differential diagnoses with support for both AI-generated and physician-added entries';
COMMENT ON COLUMN differentials.id IS 'Unique identifier for the differential diagnosis';
COMMENT ON COLUMN differentials.encounter_id IS 'Reference to the clinical encounter (session)';
COMMENT ON COLUMN differentials.patient_id IS 'Reference to the patient (user)';
COMMENT ON COLUMN differentials.diagnosis_code IS 'ICD-10 or other standard diagnosis code';
COMMENT ON COLUMN differentials.diagnosis_name IS 'Human-readable diagnosis name';
COMMENT ON COLUMN differentials.diagnosis_category IS 'Category of the diagnosis (e.g., infectious, cardiovascular)';
COMMENT ON COLUMN differentials.priority IS 'Priority ranking of the diagnosis in the differential list';
COMMENT ON COLUMN differentials.supporting_evidence IS 'JSONB array of evidence items supporting this diagnosis';
COMMENT ON COLUMN differentials.clinical_reasoning IS 'Clinical reasoning and rationale for this diagnosis';
COMMENT ON COLUMN differentials.confidence IS 'Confidence score from 0-100';
COMMENT ON COLUMN differentials.source IS 'Source of the diagnosis: ai (AI-generated) or physician (physician-added)';
COMMENT ON COLUMN differentials.added_by IS 'User ID of the person who added this diagnosis (AI system user or physician)';
COMMENT ON COLUMN differentials.added_at IS 'Timestamp when the diagnosis was added';
COMMENT ON COLUMN differentials.modified_at IS 'Timestamp when the diagnosis was last modified';
COMMENT ON COLUMN differentials.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN differentials.updated_at IS 'Timestamp when the record was last updated';

-- Create trigger to update modified_at on changes
CREATE OR REPLACE FUNCTION update_differentials_modified_at()
RETURNS TRIGGER AS $$
BEGIN
  IF (OLD.diagnosis_code IS DISTINCT FROM NEW.diagnosis_code OR
      OLD.diagnosis_name IS DISTINCT FROM NEW.diagnosis_name OR
      OLD.priority IS DISTINCT FROM NEW.priority OR
      OLD.supporting_evidence IS DISTINCT FROM NEW.supporting_evidence OR
      OLD.clinical_reasoning IS DISTINCT FROM NEW.clinical_reasoning OR
      OLD.confidence IS DISTINCT FROM NEW.confidence) THEN
    NEW.modified_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_differentials_modified_at
  BEFORE UPDATE ON differentials
  FOR EACH ROW
  EXECUTE FUNCTION update_differentials_modified_at();

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_differentials_updated_at
  BEFORE UPDATE ON differentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
