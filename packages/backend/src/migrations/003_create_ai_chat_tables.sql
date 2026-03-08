-- Migration: Create AI Chat System Tables
-- Version: 003
-- Description: Tables for patient chatbot, summaries, vitals, and clinical reasoning

-- Chat Sessions Table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'emergency')),
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  duration_minutes INTEGER,
  message_count INTEGER DEFAULT 0,
  emergency_detected BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Chat Messages Table
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Patient Summaries Table (Structured data extracted from chat)
CREATE TABLE IF NOT EXISTS patient_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE REFERENCES chat_sessions(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chief_complaint TEXT,
  symptoms JSONB DEFAULT '[]',
  duration TEXT,
  severity VARCHAR(20),
  medical_history JSONB DEFAULT '[]',
  current_medications JSONB DEFAULT '[]',
  allergies JSONB DEFAULT '[]',
  social_history JSONB DEFAULT '{}',
  review_of_systems JSONB DEFAULT '{}',
  extracted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Vitals Table
CREATE TABLE IF NOT EXISTS vitals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  recorded_by UUID NOT NULL REFERENCES users(id),
  blood_pressure_systolic INTEGER,
  blood_pressure_diastolic INTEGER,
  heart_rate INTEGER,
  temperature_fahrenheit DECIMAL(4,1),
  oxygen_saturation INTEGER,
  respiratory_rate INTEGER,
  weight_kg DECIMAL(5,2),
  height_cm DECIMAL(5,2),
  bmi DECIMAL(4,1),
  notes TEXT,
  flagged_abnormal BOOLEAN DEFAULT FALSE,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Clinical Considerations Table (AI-generated)
CREATE TABLE IF NOT EXISTS clinical_considerations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  condition_name TEXT NOT NULL,
  likelihood VARCHAR(20) CHECK (likelihood IN ('high', 'moderate', 'low')),
  urgency VARCHAR(20) CHECK (urgency IN ('urgent', 'routine', 'non-urgent')),
  supporting_factors JSONB DEFAULT '[]',
  explanation TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'modified', 'rejected')),
  doctor_notes TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMP,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Clinical Reasoning Table (Doctor's documented reasoning)
CREATE TABLE IF NOT EXISTS clinical_reasoning (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  doctor_id UUID NOT NULL REFERENCES users(id),
  differential_diagnosis JSONB DEFAULT '[]',
  diagnostic_plan TEXT,
  reasoning_rationale TEXT,
  final_notes TEXT,
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft', 'under_review', 'approved', 'rejected')),
  approved_at TIMESTAMP,
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Patient Queue Status Table
CREATE TABLE IF NOT EXISTS patient_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'chat_completed' CHECK (status IN ('chat_completed', 'vitals_added', 'ready_for_doctor', 'under_review', 'completed')),
  assigned_nurse UUID REFERENCES users(id),
  assigned_doctor UUID REFERENCES users(id),
  priority VARCHAR(20) DEFAULT 'routine' CHECK (priority IN ('emergency', 'urgent', 'routine')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(patient_id, session_id)
);

-- Indexes for performance
CREATE INDEX idx_chat_sessions_patient ON chat_sessions(patient_id);
CREATE INDEX idx_chat_sessions_status ON chat_sessions(status);
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX idx_patient_summaries_patient ON patient_summaries(patient_id);
CREATE INDEX idx_vitals_patient ON vitals(patient_id);
CREATE INDEX idx_vitals_session ON vitals(session_id);
CREATE INDEX idx_clinical_considerations_patient ON clinical_considerations(patient_id);
CREATE INDEX idx_clinical_considerations_status ON clinical_considerations(status);
CREATE INDEX idx_clinical_reasoning_patient ON clinical_reasoning(patient_id);
CREATE INDEX idx_clinical_reasoning_doctor ON clinical_reasoning(doctor_id);
CREATE INDEX idx_patient_queue_status ON patient_queue(status);
CREATE INDEX idx_patient_queue_patient ON patient_queue(patient_id);

-- Update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_summaries_updated_at BEFORE UPDATE ON patient_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinical_considerations_updated_at BEFORE UPDATE ON clinical_considerations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clinical_reasoning_updated_at BEFORE UPDATE ON clinical_reasoning
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_patient_queue_updated_at BEFORE UPDATE ON patient_queue
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
