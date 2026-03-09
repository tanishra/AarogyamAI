-- Check if vitals table exists and has data
SELECT COUNT(*) as total_vitals FROM vital_signs;

-- Check recent vitals with encounter_id
SELECT 
  id,
  patient_id,
  encounter_id,
  systolic_bp,
  diastolic_bp,
  heart_rate,
  recorded_at
FROM vital_signs
ORDER BY recorded_at DESC
LIMIT 5;

-- Check if encounter_id matches any chat_sessions
SELECT 
  vs.id as vital_id,
  vs.encounter_id,
  cs.id as session_id,
  cs.patient_id
FROM vital_signs vs
LEFT JOIN chat_sessions cs ON vs.encounter_id = cs.id
ORDER BY vs.recorded_at DESC
LIMIT 5;
