-- Migration: 017_create_vital_signs_table
-- Description: Create vital_signs table for storing patient vital measurements
-- Requirements: 28.1, 28.4, 28.5

-- Create vital_signs table
CREATE TABLE IF NOT EXISTS vital_signs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encounter_id UUID NOT NULL,
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  heart_rate INTEGER,
  respiratory_rate INTEGER,
  temperature DECIMAL(4, 1),
  temperature_unit VARCHAR(1) NOT NULL DEFAULT 'F' CHECK (temperature_unit IN ('F', 'C')),
  oxygen_saturation INTEGER,
  height DECIMAL(5, 2),
  height_unit VARCHAR(2) NOT NULL DEFAULT 'cm' CHECK (height_unit IN ('cm', 'in')),
  weight DECIMAL(5, 2),
  weight_unit VARCHAR(2) NOT NULL DEFAULT 'kg' CHECK (weight_unit IN ('kg', 'lb')),
  bmi DECIMAL(4, 1),
  recorded_by UUID NOT NULL REFERENCES users(id),
  recorded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vital_signs_patient_id ON vital_signs(patient_id);
CREATE INDEX IF NOT EXISTS idx_vital_signs_encounter_id ON vital_signs(encounter_id);
CREATE INDEX IF NOT EXISTS idx_vital_signs_recorded_at ON vital_signs(recorded_at);
CREATE INDEX IF NOT EXISTS idx_vital_signs_patient_recorded ON vital_signs(patient_id, recorded_at DESC);

-- Add comments for documentation
COMMENT ON TABLE vital_signs IS 'Stores patient vital sign measurements including blood pressure, heart rate, respiratory rate, temperature, oxygen saturation, height, weight, and BMI';
COMMENT ON COLUMN vital_signs.id IS 'Unique identifier for the vital signs record';
COMMENT ON COLUMN vital_signs.patient_id IS 'Reference to the patient (user with Patient role)';
COMMENT ON COLUMN vital_signs.encounter_id IS 'Reference to the clinical encounter';
COMMENT ON COLUMN vital_signs.systolic_bp IS 'Systolic blood pressure in mmHg';
COMMENT ON COLUMN vital_signs.diastolic_bp IS 'Diastolic blood pressure in mmHg';
COMMENT ON COLUMN vital_signs.heart_rate IS 'Heart rate in beats per minute (bpm)';
COMMENT ON COLUMN vital_signs.respiratory_rate IS 'Respiratory rate in breaths per minute';
COMMENT ON COLUMN vital_signs.temperature IS 'Body temperature (unit specified in temperature_unit)';
COMMENT ON COLUMN vital_signs.temperature_unit IS 'Temperature unit: F (Fahrenheit) or C (Celsius)';
COMMENT ON COLUMN vital_signs.oxygen_saturation IS 'Oxygen saturation percentage (SpO2)';
COMMENT ON COLUMN vital_signs.height IS 'Patient height (unit specified in height_unit)';
COMMENT ON COLUMN vital_signs.height_unit IS 'Height unit: cm (centimeters) or in (inches)';
COMMENT ON COLUMN vital_signs.weight IS 'Patient weight (unit specified in weight_unit)';
COMMENT ON COLUMN vital_signs.weight_unit IS 'Weight unit: kg (kilograms) or lb (pounds)';
COMMENT ON COLUMN vital_signs.bmi IS 'Body Mass Index (auto-calculated from height and weight)';
COMMENT ON COLUMN vital_signs.recorded_by IS 'Reference to the user (typically nurse) who recorded the vitals';
COMMENT ON COLUMN vital_signs.recorded_at IS 'Timestamp when the vitals were recorded';
COMMENT ON COLUMN vital_signs.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN vital_signs.updated_at IS 'Timestamp when the record was last updated';

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_vital_signs_updated_at
  BEFORE UPDATE ON vital_signs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
