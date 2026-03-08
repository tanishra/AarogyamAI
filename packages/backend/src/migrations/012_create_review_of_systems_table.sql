-- Migration: 012_create_review_of_systems_table
-- Description: Create review_of_systems table for standardized clinical review of systems data
-- Requirements: 7.1, 7.2, 7.4, 7.5

-- Create review_of_systems table
CREATE TABLE IF NOT EXISTS review_of_systems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  system VARCHAR(50) NOT NULL CHECK (system IN (
    'constitutional',
    'heent',
    'cardiovascular',
    'respiratory',
    'gastrointestinal',
    'genitourinary',
    'musculoskeletal',
    'skin',
    'neurological',
    'psychiatric',
    'endocrine',
    'hematologic',
    'allergic_immunologic'
  )),
  finding TEXT NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('positive', 'negative', 'unknown')),
  severity VARCHAR(20) CHECK (severity IN ('mild', 'moderate', 'severe')),
  duration TEXT,
  critical BOOLEAN DEFAULT false,
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ros_patient_id ON review_of_systems(patient_id);
CREATE INDEX IF NOT EXISTS idx_ros_session_id ON review_of_systems(session_id);
CREATE INDEX IF NOT EXISTS idx_ros_system ON review_of_systems(system);
CREATE INDEX IF NOT EXISTS idx_ros_critical ON review_of_systems(critical) WHERE critical = true;
CREATE INDEX IF NOT EXISTS idx_ros_status ON review_of_systems(status);

-- Add comments for documentation
COMMENT ON TABLE review_of_systems IS 'Stores standardized review of systems data organized by body system';
COMMENT ON COLUMN review_of_systems.id IS 'Unique identifier for the review of systems entry';
COMMENT ON COLUMN review_of_systems.patient_id IS 'Reference to the patient (user) whose review of systems this is';
COMMENT ON COLUMN review_of_systems.session_id IS 'Reference to the chat session where this was collected (optional)';
COMMENT ON COLUMN review_of_systems.system IS 'Body system: constitutional, heent, cardiovascular, respiratory, gastrointestinal, genitourinary, musculoskeletal, skin, neurological, psychiatric, endocrine, hematologic, allergic_immunologic';
COMMENT ON COLUMN review_of_systems.finding IS 'Clinical finding or symptom description';
COMMENT ON COLUMN review_of_systems.status IS 'Finding status: positive (present), negative (absent/denied), or unknown';
COMMENT ON COLUMN review_of_systems.severity IS 'Severity of positive findings: mild, moderate, or severe';
COMMENT ON COLUMN review_of_systems.duration IS 'Duration of the finding (e.g., "2 weeks", "3 months")';
COMMENT ON COLUMN review_of_systems.critical IS 'Flag indicating critical findings that require immediate attention';
COMMENT ON COLUMN review_of_systems.recorded_at IS 'Timestamp when the finding was recorded';
COMMENT ON COLUMN review_of_systems.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN review_of_systems.updated_at IS 'Timestamp when the record was last updated';

-- Create trigger to automatically update updated_at timestamp
CREATE TRIGGER update_review_of_systems_updated_at
  BEFORE UPDATE ON review_of_systems
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
