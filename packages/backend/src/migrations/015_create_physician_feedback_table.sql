-- Migration: 015_create_physician_feedback_table
-- Description: Create physician_feedback table for capturing physician feedback on AI quality
-- Requirements: 10.1, 10.2, 10.3, 10.4, 10.5

-- Create physician_feedback table
CREATE TABLE IF NOT EXISTS physician_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  differential_id UUID NOT NULL REFERENCES differentials(id) ON DELETE CASCADE,
  physician_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  categories TEXT[] NOT NULL CHECK (
    categories <@ ARRAY[
      'accuracy', 
      'completeness', 
      'relevance', 
      'clinical-reasoning-quality', 
      'missing-diagnosis', 
      'incorrect-priority'
    ]
  ),
  free_text TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_physician_feedback_differential_id ON physician_feedback(differential_id);
CREATE INDEX IF NOT EXISTS idx_physician_feedback_physician_id ON physician_feedback(physician_id);
CREATE INDEX IF NOT EXISTS idx_physician_feedback_rating ON physician_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_physician_feedback_created_at ON physician_feedback(created_at);

-- Add comments for documentation
COMMENT ON TABLE physician_feedback IS 'Stores physician feedback on AI-generated differential diagnoses for quality monitoring and improvement';
COMMENT ON COLUMN physician_feedback.id IS 'Unique identifier for the feedback entry';
COMMENT ON COLUMN physician_feedback.differential_id IS 'Reference to the differential diagnosis being rated';
COMMENT ON COLUMN physician_feedback.physician_id IS 'Reference to the physician providing feedback';
COMMENT ON COLUMN physician_feedback.rating IS '5-star rating scale (1-5) for overall AI quality';
COMMENT ON COLUMN physician_feedback.categories IS 'Array of feedback categories: accuracy, completeness, relevance, clinical-reasoning-quality, missing-diagnosis, incorrect-priority';
COMMENT ON COLUMN physician_feedback.free_text IS 'Optional free-text feedback from the physician';
COMMENT ON COLUMN physician_feedback.created_at IS 'Timestamp when the feedback was submitted';
COMMENT ON COLUMN physician_feedback.updated_at IS 'Timestamp when the feedback was last updated';

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_physician_feedback_updated_at
  BEFORE UPDATE ON physician_feedback
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
