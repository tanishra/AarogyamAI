-- Migration: 011_create_family_history_table
-- Description: Create family_history table for structured family medical history tracking
-- Requirements: 6.1, 6.2, 6.3, 6.5

-- Create family_history table
CREATE TABLE IF NOT EXISTS family_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  condition VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('cardiovascular', 'cancer', 'metabolic', 'neurological', 'autoimmune', 'other')),
  relationship VARCHAR(50) NOT NULL CHECK (relationship IN ('parent', 'sibling', 'grandparent', 'aunt-uncle', 'cousin')),
  age_of_onset INTEGER,
  maternal_or_paternal VARCHAR(20) CHECK (maternal_or_paternal IN ('maternal', 'paternal') OR maternal_or_paternal IS NULL),
  hereditary_flag BOOLEAN DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_family_history_patient_id ON family_history(patient_id);
CREATE INDEX IF NOT EXISTS idx_family_history_category ON family_history(category);
CREATE INDEX IF NOT EXISTS idx_family_history_hereditary_flag ON family_history(hereditary_flag) WHERE hereditary_flag = TRUE;

-- Add comments for documentation
COMMENT ON TABLE family_history IS 'Stores structured family medical history organized by condition categories and relationships';
COMMENT ON COLUMN family_history.id IS 'Unique identifier for the family history entry';
COMMENT ON COLUMN family_history.patient_id IS 'Reference to the patient (user) whose family history this is';
COMMENT ON COLUMN family_history.condition IS 'Medical condition name (e.g., "Breast Cancer", "Type 2 Diabetes")';
COMMENT ON COLUMN family_history.category IS 'Medical condition category: cardiovascular, cancer, metabolic, neurological, autoimmune, or other';
COMMENT ON COLUMN family_history.relationship IS 'Family relationship: parent, sibling, grandparent, aunt-uncle, or cousin';
COMMENT ON COLUMN family_history.age_of_onset IS 'Age when the family member was diagnosed with the condition';
COMMENT ON COLUMN family_history.maternal_or_paternal IS 'Whether the family member is on maternal or paternal side (NULL if not applicable)';
COMMENT ON COLUMN family_history.hereditary_flag IS 'Flag indicating conditions with strong hereditary patterns (e.g., BRCA, Lynch syndrome)';
COMMENT ON COLUMN family_history.notes IS 'Additional notes about the family history item';
COMMENT ON COLUMN family_history.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN family_history.updated_at IS 'Timestamp when the record was last updated';
