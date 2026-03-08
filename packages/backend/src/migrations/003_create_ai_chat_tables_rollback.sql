-- Rollback Migration: Drop AI Chat System Tables
-- Version: 003

-- Drop triggers
DROP TRIGGER IF EXISTS update_patient_queue_updated_at ON patient_queue;
DROP TRIGGER IF EXISTS update_clinical_reasoning_updated_at ON clinical_reasoning;
DROP TRIGGER IF EXISTS update_clinical_considerations_updated_at ON clinical_considerations;
DROP TRIGGER IF EXISTS update_patient_summaries_updated_at ON patient_summaries;
DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;

-- Drop tables in reverse order (respecting foreign keys)
DROP TABLE IF EXISTS patient_queue CASCADE;
DROP TABLE IF EXISTS clinical_reasoning CASCADE;
DROP TABLE IF EXISTS clinical_considerations CASCADE;
DROP TABLE IF EXISTS vitals CASCADE;
DROP TABLE IF EXISTS patient_summaries CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS chat_sessions CASCADE;
