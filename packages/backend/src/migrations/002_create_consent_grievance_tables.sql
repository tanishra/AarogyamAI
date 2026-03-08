-- Migration: 002_create_consent_grievance_tables
-- Description: Create consent_records, consent_withdrawal_requests, grievances, and data_access_requests tables
-- Requirements: 17.1, 18.1, 19.1, 20.1

-- Create consent_records table
CREATE TABLE IF NOT EXISTS consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id),
    consent_type VARCHAR(100) NOT NULL,
    data_categories TEXT[] NOT NULL,
    processing_purposes TEXT[] NOT NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    withdrawn_at TIMESTAMP,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'withdrawn', 'expired')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for consent_records
CREATE INDEX IF NOT EXISTS idx_consent_records_patient_id ON consent_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_consent_records_status ON consent_records(status);

-- Create consent_withdrawal_requests table
CREATE TABLE IF NOT EXISTS consent_withdrawal_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consent_id UUID NOT NULL REFERENCES consent_records(id),
    patient_id UUID NOT NULL REFERENCES users(id),
    requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP,
    processed_by UUID REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processed')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for consent_withdrawal_requests
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status ON consent_withdrawal_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_consent_id ON consent_withdrawal_requests(consent_id);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_patient_id ON consent_withdrawal_requests(patient_id);

-- Create grievances table
CREATE TABLE IF NOT EXISTS grievances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id),
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'investigating', 'resolved', 'escalated')),
    description TEXT NOT NULL,
    affected_data TEXT,
    resolution_timeline TIMESTAMP,
    dpo_notes TEXT,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for grievances
CREATE INDEX IF NOT EXISTS idx_grievances_patient_id ON grievances(patient_id);
CREATE INDEX IF NOT EXISTS idx_grievances_status ON grievances(status);
CREATE INDEX IF NOT EXISTS idx_grievances_submitted_at ON grievances(submitted_at);

-- Create data_access_requests table
CREATE TABLE IF NOT EXISTS data_access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id),
    request_type VARCHAR(50) NOT NULL CHECK (request_type IN ('data_copy', 'data_correction', 'data_deletion')),
    requested_scope TEXT NOT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled')),
    fulfilled_at TIMESTAMP,
    fulfilled_by UUID REFERENCES users(id),
    response_document_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for data_access_requests
CREATE INDEX IF NOT EXISTS idx_data_access_requests_patient_id ON data_access_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_data_access_requests_status ON data_access_requests(status);
CREATE INDEX IF NOT EXISTS idx_data_access_requests_submitted_at ON data_access_requests(submitted_at);

-- Add comments for documentation
COMMENT ON TABLE consent_records IS 'Stores patient consent records for data processing';
COMMENT ON COLUMN consent_records.consent_type IS 'Type of consent granted by the patient';
COMMENT ON COLUMN consent_records.data_categories IS 'Array of data categories covered by this consent';
COMMENT ON COLUMN consent_records.processing_purposes IS 'Array of processing purposes authorized by this consent';
COMMENT ON COLUMN consent_records.status IS 'Current status: active, withdrawn, or expired';

COMMENT ON TABLE consent_withdrawal_requests IS 'Stores patient requests to withdraw previously granted consent';
COMMENT ON COLUMN consent_withdrawal_requests.consent_id IS 'Reference to the consent record being withdrawn';
COMMENT ON COLUMN consent_withdrawal_requests.status IS 'Request status: pending or processed';
COMMENT ON COLUMN consent_withdrawal_requests.processed_by IS 'DPO who processed the withdrawal request';

COMMENT ON TABLE grievances IS 'Stores formal complaints from patients regarding data handling';
COMMENT ON COLUMN grievances.status IS 'Grievance status: pending, investigating, resolved, or escalated';
COMMENT ON COLUMN grievances.description IS 'Patient description of the grievance';
COMMENT ON COLUMN grievances.affected_data IS 'Description of data affected by the grievance';
COMMENT ON COLUMN grievances.resolution_timeline IS 'Expected or actual resolution date';
COMMENT ON COLUMN grievances.dpo_notes IS 'Internal notes from DPO regarding investigation and resolution';
COMMENT ON COLUMN grievances.resolved_by IS 'DPO who resolved the grievance';

COMMENT ON TABLE data_access_requests IS 'Stores patient requests for data access, correction, or deletion';
COMMENT ON COLUMN data_access_requests.request_type IS 'Type of request: data_copy, data_correction, or data_deletion';
COMMENT ON COLUMN data_access_requests.requested_scope IS 'Description of data scope requested';
COMMENT ON COLUMN data_access_requests.status IS 'Request status: pending or fulfilled';
COMMENT ON COLUMN data_access_requests.fulfilled_by IS 'DPO who fulfilled the request';
COMMENT ON COLUMN data_access_requests.response_document_url IS 'URL to the response document (for data_copy requests)';
