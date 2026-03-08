-- Migration: 005_create_sessions_table
-- Description: Create sessions table with activity tracking for session timeout management
-- Requirements: 14.1, 14.2, 14.6

-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  ip_address VARCHAR(45), -- Supports both IPv4 and IPv6
  user_agent TEXT,
  device_type VARCHAR(50),
  location VARCHAR(255),
  mfa_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  terminated_at TIMESTAMP,
  termination_reason VARCHAR(100)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_activity ON sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(user_id, expires_at) WHERE terminated_at IS NULL;

-- Add comments for documentation
COMMENT ON TABLE sessions IS 'Stores user authentication sessions with activity tracking for timeout management';
COMMENT ON COLUMN sessions.id IS 'Unique identifier for the session';
COMMENT ON COLUMN sessions.user_id IS 'Reference to the user who owns this session';
COMMENT ON COLUMN sessions.token_hash IS 'Hashed session token for secure session identification';
COMMENT ON COLUMN sessions.ip_address IS 'IP address from which the session was created (IPv4 or IPv6)';
COMMENT ON COLUMN sessions.user_agent IS 'Browser user agent string for device identification';
COMMENT ON COLUMN sessions.device_type IS 'Type of device (desktop, mobile, tablet)';
COMMENT ON COLUMN sessions.location IS 'Geographic location of the session (optional)';
COMMENT ON COLUMN sessions.mfa_verified IS 'Whether MFA verification was completed for this session';
COMMENT ON COLUMN sessions.created_at IS 'Timestamp when the session was created';
COMMENT ON COLUMN sessions.last_activity IS 'Timestamp of the last user activity in this session';
COMMENT ON COLUMN sessions.expires_at IS 'Timestamp when the session expires';
COMMENT ON COLUMN sessions.terminated_at IS 'Timestamp when the session was terminated (NULL if active)';
COMMENT ON COLUMN sessions.termination_reason IS 'Reason for session termination (timeout, logout, security)';
