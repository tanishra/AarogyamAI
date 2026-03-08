-- Migration: 004_create_mfa_configurations_table
-- Description: Create MFA configurations table for TOTP and SMS authentication with encrypted secrets
-- Requirements: 13.1, 13.2, 13.3, 13.4, 13.5

-- Create MFA configurations table
CREATE TABLE IF NOT EXISTS mfa_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method VARCHAR(10) NOT NULL CHECK (method IN ('totp', 'sms')),
  secret TEXT, -- Encrypted TOTP secret
  phone_number TEXT, -- Encrypted phone number for SMS
  enabled BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  backup_codes TEXT[], -- Encrypted backup codes
  created_at TIMESTAMP DEFAULT NOW(),
  verified_at TIMESTAMP,
  UNIQUE(user_id, method)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_mfa_user_id ON mfa_configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_enabled ON mfa_configurations(enabled);
CREATE INDEX IF NOT EXISTS idx_mfa_method ON mfa_configurations(method);

-- Add comments for documentation
COMMENT ON TABLE mfa_configurations IS 'Stores multi-factor authentication configurations for users with encrypted secrets';
COMMENT ON COLUMN mfa_configurations.user_id IS 'Reference to the user who owns this MFA configuration';
COMMENT ON COLUMN mfa_configurations.method IS 'MFA method type: totp (Time-based One-Time Password) or sms (SMS-based authentication)';
COMMENT ON COLUMN mfa_configurations.secret IS 'Encrypted TOTP secret key used for generating time-based codes';
COMMENT ON COLUMN mfa_configurations.phone_number IS 'Encrypted phone number for SMS-based authentication';
COMMENT ON COLUMN mfa_configurations.enabled IS 'Whether this MFA method is currently enabled for the user';
COMMENT ON COLUMN mfa_configurations.verified IS 'Whether this MFA method has been verified by the user';
COMMENT ON COLUMN mfa_configurations.backup_codes IS 'Array of encrypted backup codes for account recovery';
COMMENT ON COLUMN mfa_configurations.created_at IS 'Timestamp when the MFA configuration was created';
COMMENT ON COLUMN mfa_configurations.verified_at IS 'Timestamp when the MFA method was verified';
