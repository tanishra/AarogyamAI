-- Migration: 001_create_user_management_tables
-- Description: Create registration_requests table and extend users table for admin panel user management
-- Requirements: 1.1, 2.1, 3.1, 6.1

-- Create registration_requests table
CREATE TABLE IF NOT EXISTS registration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    applicant_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    requested_role VARCHAR(50) NOT NULL CHECK (requested_role IN ('Nurse', 'Doctor')),
    credentials TEXT,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    processed_by UUID REFERENCES users(id),
    processed_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for registration_requests
CREATE INDEX IF NOT EXISTS idx_registration_requests_status ON registration_requests(status);
CREATE INDEX IF NOT EXISTS idx_registration_requests_submitted_at ON registration_requests(submitted_at);

-- Extend users table with admin panel columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_method VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_password_change TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_mfa_verification TIMESTAMP;

-- Create indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);

-- Add comments for documentation
COMMENT ON TABLE registration_requests IS 'Stores pending registration requests from healthcare professionals';
COMMENT ON COLUMN registration_requests.requested_role IS 'Role requested by applicant: Nurse or Doctor';
COMMENT ON COLUMN registration_requests.status IS 'Request status: pending, approved, or rejected';
COMMENT ON COLUMN registration_requests.processed_by IS 'Administrator who processed the request';

COMMENT ON COLUMN users.is_active IS 'Whether the user account is active and can authenticate';
COMMENT ON COLUMN users.mfa_enabled IS 'Whether multi-factor authentication is enabled for this user';
COMMENT ON COLUMN users.mfa_method IS 'MFA method type: totp or sms';
COMMENT ON COLUMN users.mfa_secret IS 'Encrypted MFA secret for TOTP generation';
COMMENT ON COLUMN users.last_password_change IS 'Timestamp of the last password change';
COMMENT ON COLUMN users.last_mfa_verification IS 'Timestamp of the last successful MFA verification';
