-- Migration: 000_create_core_tables
-- Description: Create base tables that pre-date the numbered migration series
--   (previously created by hand in the deployed database). Must run before 001.
--   Column shapes verified against repositories/services/routes usage.

-- Core identity table (extended by 001 with is_active + MFA columns)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('Patient', 'Nurse', 'Doctor', 'Administrator', 'DPO')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Tamper-evident audit trail (hash-chained via AuditLogService)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_name VARCHAR(255),
    user_role VARCHAR(50),
    action_type VARCHAR(100) NOT NULL,
    resource VARCHAR(100),
    resource_id VARCHAR(255),
    outcome VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    request_id VARCHAR(255),
    error_details TEXT,
    hash VARCHAR(64),
    previous_hash VARCHAR(64),
    timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_type ON audit_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource, resource_id);

-- Completed/doctor consultations (used by consultation metrics)
CREATE TABLE IF NOT EXISTS consultations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID,
    doctor_id UUID REFERENCES users(id),
    session_id UUID,
    status VARCHAR(50) NOT NULL DEFAULT 'completed',
    diagnosis TEXT,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consultations_doctor ON consultations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_consultations_created ON consultations(created_at);

-- Extended user profile data (one-to-one with users)
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    phone VARCHAR(32),
    date_of_birth DATE,
    gender VARCHAR(32),
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    city VARCHAR(128),
    state VARCHAR(128),
    country VARCHAR(128),
    postal_code VARCHAR(32),
    organization VARCHAR(255),
    department VARCHAR(255),
    specialization VARCHAR(255),
    license_number VARCHAR(128),
    emergency_contact_name VARCHAR(255),
    emergency_contact_phone VARCHAR(32),
    preferred_language VARCHAR(64),
    timezone VARCHAR(64),
    bio TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- AI recommendation outcomes for acceptance-rate metrics
CREATE TABLE IF NOT EXISTS ai_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doctor_id UUID REFERENCES users(id),
    session_id UUID,
    recommendation_type VARCHAR(100),
    content TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'modified', 'rejected')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_recommendations_doctor ON ai_recommendations(doctor_id);
CREATE INDEX IF NOT EXISTS idx_ai_recommendations_status ON ai_recommendations(status);

-- Security anomaly alerts raised by AnomalyDetectionService
CREATE TABLE IF NOT EXISTS anomaly_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    user_name VARCHAR(255),
    trigger_condition VARCHAR(100) NOT NULL,
    details TEXT,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by UUID REFERENCES users(id),
    acknowledged_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_user ON anomaly_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_alerts_unack ON anomaly_alerts(acknowledged) WHERE acknowledged = false;
