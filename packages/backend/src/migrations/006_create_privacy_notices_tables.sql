-- Migration: 006_create_privacy_notices_tables
-- Description: Create privacy notices and acknowledgments tables for privacy notice management
-- Requirements: 16.1, 16.2, 16.4, 16.5

-- Create privacy_notices table
CREATE TABLE IF NOT EXISTS privacy_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(50) NOT NULL UNIQUE,
  content TEXT NOT NULL,
  effective_date DATE NOT NULL,
  sections JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  active BOOLEAN DEFAULT true
);

-- Create privacy_notice_acknowledgments table
CREATE TABLE IF NOT EXISTS privacy_notice_acknowledgments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notice_id UUID NOT NULL REFERENCES privacy_notices(id) ON DELETE CASCADE,
  notice_version VARCHAR(50) NOT NULL,
  acknowledged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_privacy_notices_version ON privacy_notices(version);
CREATE INDEX IF NOT EXISTS idx_privacy_notices_active ON privacy_notices(active);
CREATE INDEX IF NOT EXISTS idx_privacy_ack_user_id ON privacy_notice_acknowledgments(user_id);
CREATE INDEX IF NOT EXISTS idx_privacy_ack_notice_id ON privacy_notice_acknowledgments(notice_id);
CREATE INDEX IF NOT EXISTS idx_privacy_ack_user_notice ON privacy_notice_acknowledgments(user_id, notice_id);

-- Add comments for documentation
COMMENT ON TABLE privacy_notices IS 'Stores privacy notice versions with content and effective dates';
COMMENT ON COLUMN privacy_notices.id IS 'Unique identifier for the privacy notice';
COMMENT ON COLUMN privacy_notices.version IS 'Version string for the privacy notice (e.g., "1.0", "2.1")';
COMMENT ON COLUMN privacy_notices.content IS 'Full text content of the privacy notice';
COMMENT ON COLUMN privacy_notices.effective_date IS 'Date when this privacy notice becomes effective';
COMMENT ON COLUMN privacy_notices.sections IS 'JSON object containing structured sections: dataCollection, dataUsage, dataSharing, patientRights, contactInfo';
COMMENT ON COLUMN privacy_notices.created_at IS 'Timestamp when the privacy notice was created';
COMMENT ON COLUMN privacy_notices.active IS 'Whether this privacy notice is currently active';

COMMENT ON TABLE privacy_notice_acknowledgments IS 'Audit trail of user acknowledgments of privacy notices';
COMMENT ON COLUMN privacy_notice_acknowledgments.id IS 'Unique identifier for the acknowledgment';
COMMENT ON COLUMN privacy_notice_acknowledgments.user_id IS 'Reference to the user who acknowledged the notice';
COMMENT ON COLUMN privacy_notice_acknowledgments.notice_id IS 'Reference to the privacy notice that was acknowledged';
COMMENT ON COLUMN privacy_notice_acknowledgments.notice_version IS 'Version of the privacy notice at time of acknowledgment';
COMMENT ON COLUMN privacy_notice_acknowledgments.acknowledged_at IS 'Timestamp when the user acknowledged the notice';
COMMENT ON COLUMN privacy_notice_acknowledgments.ip_address IS 'IP address from which the acknowledgment was made';
COMMENT ON COLUMN privacy_notice_acknowledgments.user_agent IS 'Browser user agent string at time of acknowledgment';
