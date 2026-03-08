-- Migration: 018_create_critical_alerts_table
-- Description: Create critical_alerts table for tracking critical vital sign alerts and acknowledgments
-- Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6

-- Create critical_alerts table
CREATE TABLE IF NOT EXISTS critical_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vital_sign_id UUID NOT NULL REFERENCES vital_signs(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL,
  vital_name VARCHAR(50) NOT NULL,
  vital_value VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'moderate')),
  normal_range VARCHAR(100) NOT NULL,
  recommended_action TEXT NOT NULL,
  acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
  acknowledged_by UUID REFERENCES users(id),
  acknowledged_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_critical_alerts_vital_sign_id ON critical_alerts(vital_sign_id);
CREATE INDEX IF NOT EXISTS idx_critical_alerts_patient_id ON critical_alerts(patient_id);
CREATE INDEX IF NOT EXISTS idx_critical_alerts_encounter_id ON critical_alerts(encounter_id);
CREATE INDEX IF NOT EXISTS idx_critical_alerts_acknowledged ON critical_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_critical_alerts_created_at ON critical_alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_critical_alerts_patient_unack ON critical_alerts(patient_id, acknowledged) WHERE acknowledged = FALSE;

-- Add comments for documentation
COMMENT ON TABLE critical_alerts IS 'Stores critical vital sign alerts that require acknowledgment from healthcare providers';
COMMENT ON COLUMN critical_alerts.id IS 'Unique identifier for the critical alert';
COMMENT ON COLUMN critical_alerts.vital_sign_id IS 'Reference to the vital signs record that triggered the alert';
COMMENT ON COLUMN critical_alerts.patient_id IS 'Reference to the patient (user with Patient role)';
COMMENT ON COLUMN critical_alerts.encounter_id IS 'Reference to the clinical encounter';
COMMENT ON COLUMN critical_alerts.vital_name IS 'Name of the vital sign that triggered the alert (e.g., "Systolic Blood Pressure", "Heart Rate", "Oxygen Saturation")';
COMMENT ON COLUMN critical_alerts.vital_value IS 'The abnormal value that triggered the alert (e.g., "185 mmHg", "45 bpm", "88%")';
COMMENT ON COLUMN critical_alerts.severity IS 'Severity level of the alert: critical, high, or moderate';
COMMENT ON COLUMN critical_alerts.normal_range IS 'The normal range for this vital sign (e.g., "90-180 mmHg", "50-120 bpm", ">=90%")';
COMMENT ON COLUMN critical_alerts.recommended_action IS 'Recommended clinical action to take in response to this alert';
COMMENT ON COLUMN critical_alerts.acknowledged IS 'Whether the alert has been acknowledged by a healthcare provider';
COMMENT ON COLUMN critical_alerts.acknowledged_by IS 'Reference to the user who acknowledged the alert';
COMMENT ON COLUMN critical_alerts.acknowledged_at IS 'Timestamp when the alert was acknowledged';
COMMENT ON COLUMN critical_alerts.created_at IS 'Timestamp when the alert was created';
COMMENT ON COLUMN critical_alerts.updated_at IS 'Timestamp when the alert was last updated';

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_critical_alerts_updated_at
  BEFORE UPDATE ON critical_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
