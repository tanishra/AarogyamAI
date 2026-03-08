-- Migration: 007_create_encryption_keys_table
-- Description: Create encryption_keys table for tracking encryption keys and rotation
-- Requirements: 15.1, 15.4

-- Create encryption_keys table
CREATE TABLE IF NOT EXISTS encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id VARCHAR(255) NOT NULL UNIQUE,
  algorithm VARCHAR(50) NOT NULL DEFAULT 'AES-256-GCM',
  status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'rotating', 'retired')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  rotation_date TIMESTAMP NOT NULL,
  retired_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_encryption_keys_key_id ON encryption_keys(key_id);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_status ON encryption_keys(status);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_rotation_date ON encryption_keys(rotation_date);
CREATE INDEX IF NOT EXISTS idx_encryption_keys_active ON encryption_keys(status) WHERE status = 'active';

-- Add comments for documentation
COMMENT ON TABLE encryption_keys IS 'Stores encryption key metadata for key management and rotation tracking';
COMMENT ON COLUMN encryption_keys.id IS 'Unique identifier for the encryption key record';
COMMENT ON COLUMN encryption_keys.key_id IS 'External key identifier (e.g., from KMS)';
COMMENT ON COLUMN encryption_keys.algorithm IS 'Encryption algorithm used (default: AES-256-GCM)';
COMMENT ON COLUMN encryption_keys.status IS 'Current status of the key: active, rotating, or retired';
COMMENT ON COLUMN encryption_keys.created_at IS 'Timestamp when the key was created';
COMMENT ON COLUMN encryption_keys.rotation_date IS 'Scheduled date for key rotation (90 days from creation)';
COMMENT ON COLUMN encryption_keys.retired_at IS 'Timestamp when the key was retired (NULL if active or rotating)';
COMMENT ON COLUMN encryption_keys.metadata IS 'Additional metadata about the key (JSON format)';
