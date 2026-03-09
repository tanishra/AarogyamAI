-- Check what vitals nurse submitted
SELECT 
  id,
  patient_id,
  encounter_id,
  systolic_bp,
  diastolic_bp,
  heart_rate,
  respiratory_rate,
  temperature,
  oxygen_saturation,
  height,
  weight,
  bmi,
  recorded_at
FROM vital_signs
ORDER BY recorded_at DESC
LIMIT 3;
