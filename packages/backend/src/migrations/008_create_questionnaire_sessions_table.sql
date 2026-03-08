-- Migration: 008_create_questionnaire_sessions_table
-- Description: Create questionnaire_sessions table for patient questionnaire progress tracking
-- Requirements: 1.3, 1.4, 1.5, 3.1, 3.2, 3.3

-- Create questionnaire_sessions table
CREATE TABLE IF NOT EXISTS questionnaire_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  current_question_index INTEGER DEFAULT 0,
  answers JSONB DEFAULT '[]'::jsonb,
  skipped_questions JSONB DEFAULT '[]'::jsonb,
  uncertain_answers JSONB DEFAULT '[]'::jsonb,
  started_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  archived_at TIMESTAMP,
  session_data TEXT, -- Encrypted session state for progress saving
  fatigue_metrics JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_patient_id ON questionnaire_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_questionnaire_sessions_last_activity ON questionnaire_sessions(last_activity);

-- Add comments for documentation
COMMENT ON TABLE questionnaire_sessions IS 'Stores patient questionnaire session progress with skip controls and fatigue tracking';
COMMENT ON COLUMN questionnaire_sessions.id IS 'Unique identifier for the questionnaire session';
COMMENT ON COLUMN questionnaire_sessions.patient_id IS 'Reference to the patient (user) taking the questionnaire';
COMMENT ON COLUMN questionnaire_sessions.current_question_index IS 'Index of the current question in the questionnaire flow';
COMMENT ON COLUMN questionnaire_sessions.answers IS 'Array of answered questions with values and metadata (JSON format)';
COMMENT ON COLUMN questionnaire_sessions.skipped_questions IS 'Array of questions that were skipped by the patient (JSON format)';
COMMENT ON COLUMN questionnaire_sessions.uncertain_answers IS 'Array of questions marked as "Not Sure" by the patient (JSON format)';
COMMENT ON COLUMN questionnaire_sessions.started_at IS 'Timestamp when the questionnaire session was started';
COMMENT ON COLUMN questionnaire_sessions.last_activity IS 'Timestamp of the last activity in the session (for timeout detection)';
COMMENT ON COLUMN questionnaire_sessions.completed_at IS 'Timestamp when the questionnaire was completed (NULL if incomplete)';
COMMENT ON COLUMN questionnaire_sessions.archived_at IS 'Timestamp when the session was archived (for expired sessions)';
COMMENT ON COLUMN questionnaire_sessions.session_data IS 'Encrypted session state for resuming progress (AES-256 encrypted)';
COMMENT ON COLUMN questionnaire_sessions.fatigue_metrics IS 'Fatigue detection metrics including duration and response times (JSON format)';
