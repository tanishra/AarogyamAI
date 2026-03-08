-- Rollback Migration: 002_create_consent_grievance_tables
-- Description: Drop consent_records, consent_withdrawal_requests, grievances, and data_access_requests tables

-- Drop tables in reverse order of creation (respecting foreign key dependencies)
DROP TABLE IF EXISTS data_access_requests;
DROP TABLE IF EXISTS grievances;
DROP TABLE IF EXISTS consent_withdrawal_requests;
DROP TABLE IF EXISTS consent_records;

-- Note: Indexes are automatically dropped when tables are dropped
