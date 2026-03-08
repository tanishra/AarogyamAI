-- Migration: 010_create_question_logs_table
-- Description: Create question_logs table for tracking adaptive questioning with clinical prioritization
-- Requirements: 5.1, 5.2, 5.3, 5.6

-- Create question_logs table
CREATE TABLE IF NOT EXISTS question_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL,
  question_text TEXT NOT NULL,
  priority_score INTEGER CHECK (priority_score BETWEEN 1 AND 10),
  category VARCHAR(100),
  clinical_relevance TEXT,
  red_flag BOOLEAN DEFAULT false,
  rationale TEXT,
  asked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_question_logs_session_id ON question_logs(session_id);

-- Add comments for documentation
COMMENT ON TABLE question_logs IS 'Stores logs of questions asked during patient questionnaire sessions with clinical prioritization';
COMMENT ON COLUMN question_logs.id IS 'Unique identifier for the question log record';
COMMENT ON COLUMN question_logs.session_id IS 'Reference to the questionnaire session';
COMMENT ON COLUMN question_logs.question_id IS 'Identifier for the question asked';
COMMENT ON COLUMN question_logs.question_text IS 'The actual text of the question asked';
COMMENT ON COLUMN question_logs.priority_score IS 'Clinical priority score from 1-10, with 8+ being high priority';
COMMENT ON COLUMN question_logs.category IS 'Category of the question (e.g., red-flag, high-risk, diagnostic, contextual)';
COMMENT ON COLUMN question_logs.clinical_relevance IS 'Description of why this question is clinically relevant';
COMMENT ON COLUMN question_logs.red_flag IS 'Flag indicating if this question relates to serious/red flag symptoms';
COMMENT ON COLUMN question_logs.rationale IS 'Rationale for why this question was selected and asked';
COMMENT ON COLUMN question_logs.asked_at IS 'Timestamp when the question was asked';
