-- Migration: 019_consolidate_vitals_differentials
-- Description: Consolidate duplicate tables
--   - vitals            -> vital_signs   (richer schema: units, encounter link)
--   - clinical_considerations -> differentials (source column already
--     distinguishes 'ai' vs 'physician' rows)
-- All statements are idempotent so re-applying is a no-op.

-- ============================================================================
-- 1) vital_signs absorbs vitals
-- ============================================================================

ALTER TABLE vital_signs ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE vital_signs ADD COLUMN IF NOT EXISTS flagged_abnormal BOOLEAN NOT NULL DEFAULT FALSE;

-- Move legacy vitals rows across, preserving semantics.
-- encounter_id gets the session id; rows without a session collapse onto
-- the patient id (patient-level vitals record).
INSERT INTO vital_signs (
  patient_id, encounter_id, systolic_bp, diastolic_bp, heart_rate,
  respiratory_rate, temperature, temperature_unit, oxygen_saturation,
  height, height_unit, weight, weight_unit, bmi,
  recorded_by, recorded_at, notes, flagged_abnormal, created_at, updated_at
)
SELECT
  v.patient_id,
  COALESCE(v.session_id, v.patient_id),
  v.blood_pressure_systolic,
  v.blood_pressure_diastolic,
  v.heart_rate,
  v.respiratory_rate,
  v.temperature_fahrenheit,
  'F',
  v.oxygen_saturation,
  v.height_cm,
  'cm',
  v.weight_kg,
  'kg',
  v.bmi,
  v.recorded_by,
  v.recorded_at,
  v.notes,
  COALESCE(v.flagged_abnormal, FALSE),
  v.created_at,
  CURRENT_TIMESTAMP
FROM vitals v
WHERE NOT EXISTS (
  SELECT 1 FROM vital_signs vs
  WHERE vs.patient_id = v.patient_id
    AND vs.recorded_by = v.recorded_by
    AND vs.recorded_at = v.recorded_at
);

DROP TABLE IF EXISTS vitals;

-- ============================================================================
-- 2) differentials absorbs clinical_considerations
-- ============================================================================

ALTER TABLE differentials ADD COLUMN IF NOT EXISTS likelihood VARCHAR(20);
ALTER TABLE differentials ADD COLUMN IF NOT EXISTS urgency VARCHAR(20);
ALTER TABLE differentials ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending';
ALTER TABLE differentials ADD COLUMN IF NOT EXISTS doctor_notes TEXT;
ALTER TABLE differentials ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id);
ALTER TABLE differentials ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP;

-- AI-generated rows have no ICD code, may have no encounter, and were
-- added by the system rather than a user — relax the legacy NOT NULLs.
ALTER TABLE differentials ALTER COLUMN diagnosis_code DROP NOT NULL;
ALTER TABLE differentials ALTER COLUMN encounter_id DROP NOT NULL;
ALTER TABLE differentials ALTER COLUMN added_by DROP NOT NULL;

-- Constrain status values only if the check does not already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'differentials_status_check'
  ) THEN
    ALTER TABLE differentials
      ADD CONSTRAINT differentials_status_check
      CHECK (status IN ('pending', 'accepted', 'modified', 'rejected'));
  END IF;
END $$;

-- Physician-added rows are the doctor's own working list — implicitly
-- accepted rather than pending AI review.
UPDATE differentials SET status = 'accepted' WHERE source = 'physician' AND status = 'pending';

-- Move AI consideration rows across, preserving ids for referential
-- stability (ai_explanations FK targets differentials.id).
INSERT INTO differentials (
  id, patient_id, encounter_id, diagnosis_name, likelihood, urgency,
  supporting_evidence, clinical_reasoning, status, doctor_notes,
  reviewed_by, reviewed_at, source, added_by, priority,
  added_at, created_at, updated_at
)
SELECT
  cc.id,
  cc.patient_id,
  cc.session_id,
  cc.condition_name,
  cc.likelihood,
  cc.urgency,
  cc.supporting_factors,
  cc.explanation,
  cc.status,
  cc.doctor_notes,
  cc.reviewed_by,
  cc.reviewed_at,
  'ai',
  NULL,
  1,
  cc.generated_at,
  cc.created_at,
  cc.updated_at
FROM clinical_considerations cc
WHERE NOT EXISTS (SELECT 1 FROM differentials d WHERE d.id = cc.id)
ON CONFLICT (id) DO NOTHING;

DROP TABLE IF EXISTS clinical_considerations;

CREATE INDEX IF NOT EXISTS idx_differentials_status ON differentials(status);
CREATE INDEX IF NOT EXISTS idx_differentials_source_status ON differentials(source, status);
