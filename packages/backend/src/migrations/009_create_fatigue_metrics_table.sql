-- Migration: 009_create_fatigue_metrics_table
-- Description: Create fatigue_metrics table for tracking patient questionnaire fatigue
-- Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7

-- Create fatigue_metrics table
CREATE TABLE IF NOT EXISTS fatigue_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE CASCADE,
  session_duration INTEGER, -- milliseconds
  average_response_time INTEGER, -- milliseconds
  response_time_increase DECIMAL(5,2), -- percentage increase from baseline
  fatigue_severity VARCHAR(20) CHECK (fatigue_severity IN ('none', 'mild', 'moderate', 'severe')),
  recommendation VARCHAR(50) CHECK (recommendation IN ('continue', 'break', 'prioritize-critical')),
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_fatigue_metrics_session_id ON fatigue_metrics(session_id);

-- Add comments for documentation
COMMENT ON TABLE fatigue_metrics IS 'Stores fatigue detection metrics for patient questionnaire sessions';
COMMENT ON COLUMN fatigue_metrics.id IS 'Unique identifier for the fatigue metric record';
COMMENT ON COLUMN fatigue_metrics.session_id IS 'Reference to the questionnaire session';
COMMENT ON COLUMN fatigue_metrics.session_duration IS 'Total duration of the session in milliseconds';
COMMENT ON COLUMN fatigue_metrics.average_response_time IS 'Average response time per question in milliseconds';
COMMENT ON COLUMN fatigue_metrics.response_time_increase IS 'Percentage increase in response time compared to baseline';
COMMENT ON COLUMN fatigue_metrics.fatigue_severity IS 'Severity level of detected fatigue: none, mild, moderate, severe';
COMMENT ON COLUMN fatigue_metrics.recommendation IS 'Recommended action: continue, break, or prioritize-critical';
COMMENT ON COLUMN fatigue_metrics.recorded_at IS 'Timestamp when the fatigue metrics were recorded';
