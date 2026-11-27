import { query } from '../config/database';

export interface Vitals {
  id: string;
  patientId: string;
  sessionId?: string;
  recordedBy: string;
  bloodPressureSystolic?: number | null;
  bloodPressureDiastolic?: number | null;
  heartRate?: number | null;
  temperatureFahrenheit?: number | null;
  oxygenSaturation?: number | null;
  respiratoryRate?: number | null;
  weightKg?: number | null;
  heightCm?: number | null;
  bmi?: number | null;
  notes?: string;
  flaggedAbnormal: boolean;
  recordedAt: Date;
}

/** Vitals fields accepted by create() */
export interface VitalsInput {
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
}

/** Raw vital_signs table row */
interface VitalsRow {
  id: string;
  patient_id: string;
  encounter_id: string;
  recorded_by: string;
  systolic_bp: number | null;
  diastolic_bp: number | null;
  heart_rate: number | null;
  temperature: number | null;
  oxygen_saturation: number | null;
  respiratory_rate: number | null;
  weight: number | null;
  height: number | null;
  bmi: number | null;
  notes: string | null;
  flagged_abnormal: boolean | null;
  recorded_at: Date;
}

export class VitalsRepository {
  /**
   * Add vitals for patient
   */
  async create(vitals: VitalsInput): Promise<Vitals> {
    // Calculate BMI if height and weight provided
    let bmi: number | undefined;
    if (vitals.weightKg && vitals.heightCm) {
      const heightM = vitals.heightCm / 100;
      bmi = vitals.weightKg / (heightM * heightM);
    }

    // Flag abnormal vitals
    const flaggedAbnormal = this.checkAbnormalVitals(vitals);

    const result = await query<VitalsRow>(
      `INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by,
        systolic_bp, diastolic_bp,
        heart_rate, temperature, temperature_unit, oxygen_saturation,
        respiratory_rate, weight, weight_unit, height, height_unit, bmi,
        notes, flagged_abnormal
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'F', $8, $9, $10, 'kg', $11, 'cm', $12, $13, $14)
      RETURNING *`,
      [
        vitals.patientId,
        vitals.sessionId || vitals.patientId,
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

    return this.mapRow(result[0]);
  }

  private mapRow(row: VitalsRow): Vitals {
    return {
      id: row.id,
      patientId: row.patient_id,
      sessionId: row.encounter_id,
      recordedBy: row.recorded_by,
      bloodPressureSystolic: row.systolic_bp,
      bloodPressureDiastolic: row.diastolic_bp,
      heartRate: row.heart_rate,
      temperatureFahrenheit: row.temperature,
      oxygenSaturation: row.oxygen_saturation,
      respiratoryRate: row.respiratory_rate,
      weightKg: row.weight,
      heightCm: row.height,
      bmi: row.bmi,
      notes: row.notes ?? undefined,
      flaggedAbnormal: row.flagged_abnormal ?? false,
      recordedAt: row.recorded_at,
    };
  }

  /**
   * Get vitals by session
   */
  async getBySession(sessionId: string): Promise<Vitals | null> {
    const result = await query<VitalsRow>(
      `SELECT * FROM vital_signs
       WHERE encounter_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [sessionId]
    );

    if (result.length === 0) return null;
    return this.mapRow(result[0]);
  }

  /**
   * Get patient's vitals history
   */
  async getByPatient(patientId: string, limit: number = 10): Promise<Vitals[]> {
    const result = await query<VitalsRow>(
      `SELECT * FROM vital_signs
       WHERE patient_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [patientId, limit]
    );

    return result.map(row => this.mapRow(row));
  }

  /**
   * Check if vitals are abnormal
   */
  private checkAbnormalVitals(vitals: VitalsInput): boolean {
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
