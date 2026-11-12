-- Rollback: 019_consolidate_vitals_differentials
-- Restores the two legacy tables and moves applicable rows back.
-- `vital_signs` and `differentials` are kept (they existed before 019),
-- only their 019-era additions are removed.

-- ============================================================================
-- 1) Restore vitals and move all vital_signs rows back into legacy shape
-- ============================================================================

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

INSERT INTO vitals (
  patient_id, session_id, recorded_by,
  blood_pressure_systolic, blood_pressure_diastolic, heart_rate,
  temperature_fahrenheit, oxygen_saturation, respiratory_rate,
  weight_kg, height_cm, bmi, notes, flagged_abnormal,
  recorded_at, created_at
)
SELECT
  patient_id, encounter_id, recorded_by,
  systolic_bp, diastolic_bp, heart_rate,
  temperature, oxygen_saturation, respiratory_rate,
  weight, height, bmi, notes, flagged_abnormal,
  recorded_at, created_at
FROM vital_signs vs
WHERE NOT EXISTS (
  SELECT 1 FROM vitals v
  WHERE v.patient_id = vs.patient_id
    AND v.recorded_by = vs.recorded_by
    AND v.recorded_at = vs.recorded_at
);

ALTER TABLE vital_signs DROP COLUMN IF EXISTS flagged_abnormal;
ALTER TABLE vital_signs DROP COLUMN IF EXISTS notes;

-- ============================================================================
-- 2) Restore clinical_considerations and move AI rows back
-- ============================================================================

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

INSERT INTO clinical_considerations (
  id, patient_id, session_id, condition_name, likelihood, urgency,
  supporting_factors, explanation, status, doctor_notes,
  reviewed_by, reviewed_at, generated_at, created_at, updated_at
)
SELECT
  id, patient_id, encounter_id, diagnosis_name, likelihood, urgency,
  supporting_evidence, clinical_reasoning, status, doctor_notes,
  reviewed_by, reviewed_at, added_at, created_at, updated_at
FROM differentials d
WHERE d.source = 'ai'
  AND NOT EXISTS (SELECT 1 FROM clinical_considerations cc WHERE cc.id = d.id);

DELETE FROM differentials WHERE source = 'ai';

-- Remove 019-era additions (leaves differentials at its 013 shape)
DROP INDEX IF EXISTS idx_differentials_source_status;
DROP INDEX IF EXISTS idx_differentials_status;
ALTER TABLE differentials DROP CONSTRAINT IF EXISTS differentials_status_check;
ALTER TABLE differentials DROP COLUMN IF EXISTS reviewed_at;
ALTER TABLE differentials DROP COLUMN IF EXISTS reviewed_by;
ALTER TABLE differentials DROP COLUMN IF EXISTS doctor_notes;
ALTER TABLE differentials DROP COLUMN IF EXISTS status;
ALTER TABLE differentials DROP COLUMN IF EXISTS urgency;
ALTER TABLE differentials DROP COLUMN IF EXISTS likelihood;
ALTER TABLE differentials ALTER COLUMN added_by SET NOT NULL;
ALTER TABLE differentials ALTER COLUMN encounter_id SET NOT NULL;
ALTER TABLE differentials ALTER COLUMN diagnosis_code SET NOT NULL;
