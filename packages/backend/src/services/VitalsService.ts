import { Pool } from 'pg';

/**
 * Vitals Service
 * Requirements: 28.1, 28.2, 28.3, 28.4, 28.6
 * 
 * Manages vital signs entry, validation, and retrieval
 */

export interface VitalSigns {
  systolicBp?: number;
  diastolicBp?: number;
  heartRate?: number;
  respiratoryRate?: number;
  temperature?: number;
  temperatureUnit: 'F' | 'C';
  oxygenSaturation?: number;
  height?: number;
  heightUnit: 'cm' | 'in';
  weight?: number;
  weightUnit: 'kg' | 'lb';
  bmi?: number;
}

export interface SubmitVitalsParams {
  patientId: string;
  encounterId: string;
  vitals: VitalSigns;
  recordedBy: string;
}

export interface ValidationWarning {
  vital: string;
  value: number;
  normalRange: string;
  severity: 'warning' | 'critical';
}

export class VitalsService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Submit vitals with validation
   * Requirements: 28.1, 28.4
   */
  async submitVitals(params: SubmitVitalsParams): Promise<{ vitalSignId: string; warnings: ValidationWarning[] }> {
    // Calculate BMI if height and weight provided
    const bmi = this.calculateBMI(params.vitals);
    
    // Validate ranges and generate warnings
    const warnings = this.validateRanges(params.vitals);

    const result = await this.pool.query(
      `INSERT INTO vital_signs (
        patient_id, encounter_id, systolic_bp, diastolic_bp,
        heart_rate, respiratory_rate, temperature, temperature_unit,
        oxygen_saturation, height, height_unit, weight, weight_unit,
        bmi, recorded_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id`,
      [
        params.patientId,
        params.encounterId,
        params.vitals.systolicBp || null,
        params.vitals.diastolicBp || null,
        params.vitals.heartRate || null,
        params.vitals.respiratoryRate || null,
        params.vitals.temperature || null,
        params.vitals.temperatureUnit,
        params.vitals.oxygenSaturation || null,
        params.vitals.height || null,
        params.vitals.heightUnit,
        params.vitals.weight || null,
        params.vitals.weightUnit,
        bmi,
        params.recordedBy,
      ]
    );

    return {
      vitalSignId: result.rows[0].id,
      warnings,
    };
  }

  /**
   * Calculate BMI automatically
   * Requirement: 28.2
   */
  calculateBMI(vitals: VitalSigns): number | null {
    if (!vitals.height || !vitals.weight) {
      return null;
    }

    // Convert to metric (kg and meters)
    let heightM = vitals.height;
    if (vitals.heightUnit === 'in') {
      heightM = vitals.height * 0.0254; // inches to meters
    } else {
      heightM = vitals.height / 100; // cm to meters
    }

    let weightKg = vitals.weight;
    if (vitals.weightUnit === 'lb') {
      weightKg = vitals.weight * 0.453592; // pounds to kg
    }

    const bmi = weightKg / (heightM * heightM);
    return Math.round(bmi * 10) / 10; // Round to 1 decimal
  }

  /**
   * Validate ranges with normal range checking
   * Requirement: 28.3
   */
  validateRanges(vitals: VitalSigns): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    // Systolic BP: Normal 90-120, Warning 121-139, Critical <90 or >=140
    if (vitals.systolicBp !== undefined) {
      if (vitals.systolicBp < 90) {
        warnings.push({
          vital: 'Systolic Blood Pressure',
          value: vitals.systolicBp,
          normalRange: '90-120 mmHg',
          severity: 'critical',
        });
      } else if (vitals.systolicBp >= 140) {
        warnings.push({
          vital: 'Systolic Blood Pressure',
          value: vitals.systolicBp,
          normalRange: '90-120 mmHg',
          severity: 'critical',
        });
      } else if (vitals.systolicBp > 120) {
        warnings.push({
          vital: 'Systolic Blood Pressure',
          value: vitals.systolicBp,
          normalRange: '90-120 mmHg',
          severity: 'warning',
        });
      }
    }

    // Diastolic BP: Normal 60-80, Warning 81-89, Critical <60 or >=90
    if (vitals.diastolicBp !== undefined) {
      if (vitals.diastolicBp < 60 || vitals.diastolicBp >= 90) {
        warnings.push({
          vital: 'Diastolic Blood Pressure',
          value: vitals.diastolicBp,
          normalRange: '60-80 mmHg',
          severity: 'critical',
        });
      } else if (vitals.diastolicBp > 80) {
        warnings.push({
          vital: 'Diastolic Blood Pressure',
          value: vitals.diastolicBp,
          normalRange: '60-80 mmHg',
          severity: 'warning',
        });
      }
    }

    // Heart Rate: Normal 60-100, Critical <50 or >120
    if (vitals.heartRate !== undefined) {
      if (vitals.heartRate < 50 || vitals.heartRate > 120) {
        warnings.push({
          vital: 'Heart Rate',
          value: vitals.heartRate,
          normalRange: '60-100 bpm',
          severity: 'critical',
        });
      } else if (vitals.heartRate < 60 || vitals.heartRate > 100) {
        warnings.push({
          vital: 'Heart Rate',
          value: vitals.heartRate,
          normalRange: '60-100 bpm',
          severity: 'warning',
        });
      }
    }

    // Respiratory Rate: Normal 12-20, Critical <10 or >25
    if (vitals.respiratoryRate !== undefined) {
      if (vitals.respiratoryRate < 10 || vitals.respiratoryRate > 25) {
        warnings.push({
          vital: 'Respiratory Rate',
          value: vitals.respiratoryRate,
          normalRange: '12-20 breaths/min',
          severity: 'critical',
        });
      } else if (vitals.respiratoryRate < 12 || vitals.respiratoryRate > 20) {
        warnings.push({
          vital: 'Respiratory Rate',
          value: vitals.respiratoryRate,
          normalRange: '12-20 breaths/min',
          severity: 'warning',
        });
      }
    }

    // Temperature: Normal 97-99°F (36.1-37.2°C), Critical <95°F or >103°F
    if (vitals.temperature !== undefined) {
      const tempF = vitals.temperatureUnit === 'C' 
        ? (vitals.temperature * 9/5) + 32 
        : vitals.temperature;

      if (tempF < 95 || tempF > 103) {
        warnings.push({
          vital: 'Temperature',
          value: vitals.temperature,
          normalRange: vitals.temperatureUnit === 'F' ? '97-99°F' : '36.1-37.2°C',
          severity: 'critical',
        });
      } else if (tempF < 97 || tempF > 99) {
        warnings.push({
          vital: 'Temperature',
          value: vitals.temperature,
          normalRange: vitals.temperatureUnit === 'F' ? '97-99°F' : '36.1-37.2°C',
          severity: 'warning',
        });
      }
    }

    // Oxygen Saturation: Normal >=95%, Critical <90%
    if (vitals.oxygenSaturation !== undefined) {
      if (vitals.oxygenSaturation < 90) {
        warnings.push({
          vital: 'Oxygen Saturation',
          value: vitals.oxygenSaturation,
          normalRange: '>=95%',
          severity: 'critical',
        });
      } else if (vitals.oxygenSaturation < 95) {
        warnings.push({
          vital: 'Oxygen Saturation',
          value: vitals.oxygenSaturation,
          normalRange: '>=95%',
          severity: 'warning',
        });
      }
    }

    return warnings;
  }

  /**
   * Get previous vitals for comparison display
   * Requirement: 28.6
   */
  async getPreviousVitals(patientId: string, limit: number = 5): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT id, encounter_id, systolic_bp, diastolic_bp, heart_rate,
              respiratory_rate, temperature, temperature_unit, oxygen_saturation,
              height, height_unit, weight, weight_unit, bmi, recorded_at
       FROM vital_signs
       WHERE patient_id = $1
       ORDER BY recorded_at DESC
       LIMIT $2`,
      [patientId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      encounterId: row.encounter_id,
      systolicBp: row.systolic_bp,
      diastolicBp: row.diastolic_bp,
      heartRate: row.heart_rate,
      respiratoryRate: row.respiratory_rate,
      temperature: row.temperature,
      temperatureUnit: row.temperature_unit,
      oxygenSaturation: row.oxygen_saturation,
      height: row.height,
      heightUnit: row.height_unit,
      weight: row.weight,
      weightUnit: row.weight_unit,
      bmi: row.bmi,
      recordedAt: row.recorded_at,
    }));
  }

  /**
   * Get latest vitals for an encounter
   */
  async getLatestVitals(encounterId: string): Promise<any | null> {
    const result = await this.pool.query(
      `SELECT id, patient_id, encounter_id, systolic_bp, diastolic_bp, heart_rate,
              respiratory_rate, temperature, temperature_unit, oxygen_saturation,
              height, height_unit, weight, weight_unit, bmi, recorded_at, recorded_by
       FROM vital_signs
       WHERE encounter_id = $1
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [encounterId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      patientId: row.patient_id,
      encounterId: row.encounter_id,
      systolicBp: row.systolic_bp,
      diastolicBp: row.diastolic_bp,
      heartRate: row.heart_rate,
      respiratoryRate: row.respiratory_rate,
      temperature: row.temperature,
      temperatureUnit: row.temperature_unit,
      oxygenSaturation: row.oxygen_saturation,
      height: row.height,
      heightUnit: row.height_unit,
      weight: row.weight,
      weightUnit: row.weight_unit,
      bmi: row.bmi,
      recordedAt: row.recorded_at,
      recordedBy: row.recorded_by,
    };
  }
}
