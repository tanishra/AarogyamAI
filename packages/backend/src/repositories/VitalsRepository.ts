import { query } from '../config/database';

export interface Vitals {
  id: string;
  patientId: string;
  sessionId?: string;
  recordedBy: string;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  heartRate?: number;
  temperatureFahrenheit?: number;
  oxygenSaturation?: number;
  respiratoryRate?: number;
  weightKg?: number;
  heightCm?: number;
  bmi?: number;
  notes?: string;
  flaggedAbnormal: boolean;
  recordedAt: Date;
}

export class VitalsRepository {
  /**
   * Add vitals for patient
   */
  async create(vitals: {
    patientId: string;
    sessionId?: string;
    recordedBy: string;
    bloodPressureSystolic?: number;
    bloodPressureDiastolic?: number;
    heartRate?: number;
    temperatureFahrenheit?: number;
    oxygenSaturation?: number;
    respiratoryRate?: number;
    weightKg?: number;
    heightCm?: number;
    notes?: string;
  }): Promise<Vitals> {
    // Calculate BMI if height and weight provided
    let bmi: number | undefined;
    if (vitals.weightKg && vitals.heightCm) {
      const heightM = vitals.heightCm / 100;
      bmi = vitals.weightKg / (heightM * heightM);
    }

    // Flag abnormal vitals
    const flaggedAbnormal = this.checkAbnormalVitals(vitals);

    const result = await query<Vitals>(
      `INSERT INTO vitals (
        patient_id, session_id, recorded_by,
        blood_pressure_systolic, blood_pressure_diastolic,
        heart_rate, temperature_fahrenheit, oxygen_saturation,
        respiratory_rate, weight_kg, height_cm, bmi,
        notes, flagged_abnormal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        vitals.patientId,
        vitals.sessionId || null,
        vitals.recordedBy,
        vitals.bloodPressureSystolic || null,
        vitals.bloodPressureDiastolic || null,
        vitals.heartRate || null,
        vitals.temperatureFahrenheit || null,
        vitals.oxygenSaturation || null,
        vitals.respiratoryRate || null,
        vitals.weightKg || null,
        vitals.heightCm || null,
        bmi || null,
        vitals.notes || null,
        flaggedAbnormal,
      ]
    );

    return result[0];
  }

  /**
   * Get vitals by session
   */
  async getBySession(sessionId: string): Promise<Vitals | null> {
    console.log('[VitalsRepository] getBySession called with sessionId:', sessionId);
    const result = await query<any>(
      `SELECT 
        id,
        patient_id,
        encounter_id as session_id,
        recorded_by,
        systolic_bp as blood_pressure_systolic,
        diastolic_bp as blood_pressure_diastolic,
        heart_rate,
        temperature as temperature_fahrenheit,
        oxygen_saturation,
        respiratory_rate,
        weight as weight_kg,
        height as height_cm,
        bmi,
        recorded_at
       FROM vital_signs 
       WHERE encounter_id = $1 
       ORDER BY recorded_at DESC 
       LIMIT 1`,
      [sessionId]
    );
    
    console.log('[VitalsRepository] Query result count:', result.length);
    if (result.length > 0) {
      console.log('[VitalsRepository] Found vitals:', result[0]);
    }
    
    if (result.length === 0) return null;
    
    const row = result[0];
    return {
      id: row.id,
      patientId: row.patient_id,
      sessionId: row.session_id,
      recordedBy: row.recorded_by,
      bloodPressureSystolic: row.blood_pressure_systolic,
      bloodPressureDiastolic: row.blood_pressure_diastolic,
      heartRate: row.heart_rate,
      temperatureFahrenheit: row.temperature_fahrenheit,
      oxygenSaturation: row.oxygen_saturation,
      respiratoryRate: row.respiratory_rate,
      weightKg: row.weight_kg,
      heightCm: row.height_cm,
      bmi: row.bmi,
      notes: undefined,
      flaggedAbnormal: false,
      recordedAt: row.recorded_at,
    };
  }

  /**
   * Get patient's vitals history
   */
  async getByPatient(patientId: string, limit: number = 10): Promise<Vitals[]> {
    const result = await query<any>(
      `SELECT 
        id,
        patient_id,
        encounter_id as session_id,
        recorded_by,
        systolic_bp as blood_pressure_systolic,
        diastolic_bp as blood_pressure_diastolic,
        heart_rate,
        temperature as temperature_fahrenheit,
        oxygen_saturation,
        respiratory_rate,
        weight as weight_kg,
        height as height_cm,
        bmi,
        recorded_at
       FROM vital_signs 
       WHERE patient_id = $1 
       ORDER BY recorded_at DESC 
       LIMIT $2`,
      [patientId, limit]
    );
    
    return result.map(row => ({
      id: row.id,
      patientId: row.patient_id,
      sessionId: row.session_id,
      recordedBy: row.recorded_by,
      bloodPressureSystolic: row.blood_pressure_systolic,
      bloodPressureDiastolic: row.blood_pressure_diastolic,
      heartRate: row.heart_rate,
      temperatureFahrenheit: row.temperature_fahrenheit,
      oxygenSaturation: row.oxygen_saturation,
      respiratoryRate: row.respiratory_rate,
      weightKg: row.weight_kg,
      heightCm: row.height_cm,
      bmi: row.bmi,
      notes: undefined,
      flaggedAbnormal: false,
      recordedAt: row.recorded_at,
    }));
  }

  /**
   * Check if vitals are abnormal
   */
  private checkAbnormalVitals(vitals: any): boolean {
    // Systolic BP: normal 90-120
    if (vitals.bloodPressureSystolic && 
        (vitals.bloodPressureSystolic < 90 || vitals.bloodPressureSystolic > 140)) {
      return true;
    }

    // Diastolic BP: normal 60-80
    if (vitals.bloodPressureDiastolic && 
        (vitals.bloodPressureDiastolic < 60 || vitals.bloodPressureDiastolic > 90)) {
      return true;
    }

    // Heart rate: normal 60-100
    if (vitals.heartRate && 
        (vitals.heartRate < 60 || vitals.heartRate > 100)) {
      return true;
    }

    // Temperature: normal 97-99°F
    if (vitals.temperatureFahrenheit && 
        (vitals.temperatureFahrenheit < 97 || vitals.temperatureFahrenheit > 99.5)) {
      return true;
    }

    // Oxygen saturation: normal >95%
    if (vitals.oxygenSaturation && vitals.oxygenSaturation < 95) {
      return true;
    }

    // Respiratory rate: normal 12-20
    if (vitals.respiratoryRate && 
        (vitals.respiratoryRate < 12 || vitals.respiratoryRate > 20)) {
      return true;
    }

    return false;
  }
}

export const vitalsRepository = new VitalsRepository();
