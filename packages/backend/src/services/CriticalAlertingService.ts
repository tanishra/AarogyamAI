import { Pool } from 'pg';

/**
 * Critical Alerting Service
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6, 29.7
 * 
 * Manages critical vital sign alerts and acknowledgments
 */

export interface CriticalAlert {
  id: string;
  vitalSignId: string;
  patientId: string;
  encounterId: string;
  vitalName: string;
  vitalValue: string;
  severity: 'critical' | 'high' | 'moderate';
  normalRange: string;
  recommendedAction: string;
  acknowledged: boolean;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  createdAt: Date;
}

export interface CheckVitalsParams {
  vitalSignId: string;
  patientId: string;
  encounterId: string;
  systolicBp?: number;
  diastolicBp?: number;
  heartRate?: number;
  respiratoryRate?: number;
  temperature?: number;
  temperatureUnit?: 'F' | 'C';
  oxygenSaturation?: number;
}

export class CriticalAlertingService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Check vitals with threshold checking and generate alerts
   * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5
   */
  async checkVitals(params: CheckVitalsParams): Promise<CriticalAlert[]> {
    const alerts: CriticalAlert[] = [];

    // Check Systolic BP: Critical if <90 or >=180
    if (params.systolicBp !== undefined && (params.systolicBp < 90 || params.systolicBp >= 180)) {
      const alert = await this.createAlert({
        vitalSignId: params.vitalSignId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        vitalName: 'Systolic Blood Pressure',
        vitalValue: `${params.systolicBp} mmHg`,
        severity: 'critical',
        normalRange: '90-180 mmHg',
        recommendedAction: params.systolicBp < 90 
          ? 'Hypotension detected. Check patient immediately, consider IV fluids, notify physician.'
          : 'Hypertension crisis. Recheck immediately, notify physician, consider antihypertensive medication.',
      });
      alerts.push(alert);
    }

    // Check Diastolic BP: Critical if <60 or >=110
    if (params.diastolicBp !== undefined && (params.diastolicBp < 60 || params.diastolicBp >= 110)) {
      const alert = await this.createAlert({
        vitalSignId: params.vitalSignId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        vitalName: 'Diastolic Blood Pressure',
        vitalValue: `${params.diastolicBp} mmHg`,
        severity: 'critical',
        normalRange: '60-110 mmHg',
        recommendedAction: 'Abnormal diastolic pressure. Recheck immediately and notify physician.',
      });
      alerts.push(alert);
    }

    // Check Heart Rate: Critical if <50 or >120
    if (params.heartRate !== undefined && (params.heartRate < 50 || params.heartRate > 120)) {
      const alert = await this.createAlert({
        vitalSignId: params.vitalSignId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        vitalName: 'Heart Rate',
        vitalValue: `${params.heartRate} bpm`,
        severity: 'critical',
        normalRange: '50-120 bpm',
        recommendedAction: params.heartRate < 50
          ? 'Bradycardia detected. Check patient, obtain ECG, notify physician immediately.'
          : 'Tachycardia detected. Assess patient, check for pain/anxiety, notify physician.',
      });
      alerts.push(alert);
    }

    // Check Respiratory Rate: Critical if <10 or >25
    if (params.respiratoryRate !== undefined && (params.respiratoryRate < 10 || params.respiratoryRate > 25)) {
      const alert = await this.createAlert({
        vitalSignId: params.vitalSignId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        vitalName: 'Respiratory Rate',
        vitalValue: `${params.respiratoryRate} breaths/min`,
        severity: 'critical',
        normalRange: '10-25 breaths/min',
        recommendedAction: params.respiratoryRate < 10
          ? 'Respiratory depression. Assess airway, consider respiratory support, notify physician immediately.'
          : 'Tachypnea detected. Assess for respiratory distress, check oxygen saturation, notify physician.',
      });
      alerts.push(alert);
    }

    // Check Temperature: Critical if <95°F or >103°F
    if (params.temperature !== undefined && params.temperatureUnit) {
      const tempF = params.temperatureUnit === 'C' 
        ? (params.temperature * 9/5) + 32 
        : params.temperature;

      if (tempF < 95 || tempF > 103) {
        const alert = await this.createAlert({
          vitalSignId: params.vitalSignId,
          patientId: params.patientId,
          encounterId: params.encounterId,
          vitalName: 'Temperature',
          vitalValue: `${params.temperature}°${params.temperatureUnit}`,
          severity: 'critical',
          normalRange: params.temperatureUnit === 'F' ? '95-103°F' : '35-39.4°C',
          recommendedAction: tempF < 95
            ? 'Hypothermia detected. Warm patient, check for sepsis, notify physician immediately.'
            : 'High fever detected. Administer antipyretics, check for infection source, notify physician.',
        });
        alerts.push(alert);
      }
    }

    // Check Oxygen Saturation: Critical if <90%
    if (params.oxygenSaturation !== undefined && params.oxygenSaturation < 90) {
      const alert = await this.createAlert({
        vitalSignId: params.vitalSignId,
        patientId: params.patientId,
        encounterId: params.encounterId,
        vitalName: 'Oxygen Saturation',
        vitalValue: `${params.oxygenSaturation}%`,
        severity: 'critical',
        normalRange: '>=90%',
        recommendedAction: 'Hypoxemia detected. Administer oxygen immediately, assess respiratory status, notify physician.',
      });
      alerts.push(alert);
    }

    return alerts;
  }

  /**
   * Create alert in database
   */
  private async createAlert(params: {
    vitalSignId: string;
    patientId: string;
    encounterId: string;
    vitalName: string;
    vitalValue: string;
    severity: 'critical' | 'high' | 'moderate';
    normalRange: string;
    recommendedAction: string;
  }): Promise<CriticalAlert> {
    const result = await this.pool.query(
      `INSERT INTO critical_alerts (
        vital_sign_id, patient_id, encounter_id, vital_name, vital_value,
        severity, normal_range, recommended_action
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, vital_sign_id, patient_id, encounter_id, vital_name, vital_value,
                severity, normal_range, recommended_action, acknowledged,
                acknowledged_by, acknowledged_at, created_at`,
      [
        params.vitalSignId,
        params.patientId,
        params.encounterId,
        params.vitalName,
        params.vitalValue,
        params.severity,
        params.normalRange,
        params.recommendedAction,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      vitalSignId: row.vital_sign_id,
      patientId: row.patient_id,
      encounterId: row.encounter_id,
      vitalName: row.vital_name,
      vitalValue: row.vital_value,
      severity: row.severity,
      normalRange: row.normal_range,
      recommendedAction: row.recommended_action,
      acknowledged: row.acknowledged,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      createdAt: row.created_at,
    };
  }

  /**
   * Require acknowledgment with blocking logic
   * Requirements: 29.6, 29.7
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    await this.pool.query(
      `UPDATE critical_alerts 
       SET acknowledged = TRUE, acknowledged_by = $1, acknowledged_at = NOW()
       WHERE id = $2`,
      [acknowledgedBy, alertId]
    );
  }

  /**
   * Get active (unacknowledged) alerts
   */
  async getActiveAlerts(patientId?: string): Promise<CriticalAlert[]> {
    const query = patientId
      ? `SELECT * FROM critical_alerts WHERE acknowledged = FALSE AND patient_id = $1 ORDER BY created_at DESC`
      : `SELECT * FROM critical_alerts WHERE acknowledged = FALSE ORDER BY created_at DESC`;

    const params = patientId ? [patientId] : [];
    const result = await this.pool.query(query, params);

    return result.rows.map(row => ({
      id: row.id,
      vitalSignId: row.vital_sign_id,
      patientId: row.patient_id,
      encounterId: row.encounter_id,
      vitalName: row.vital_name,
      vitalValue: row.vital_value,
      severity: row.severity,
      normalRange: row.normal_range,
      recommendedAction: row.recommended_action,
      acknowledged: row.acknowledged,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get alerts for an encounter
   */
  async getAlertsForEncounter(encounterId: string): Promise<CriticalAlert[]> {
    const result = await this.pool.query(
      `SELECT * FROM critical_alerts WHERE encounter_id = $1 ORDER BY created_at DESC`,
      [encounterId]
    );

    return result.rows.map(row => ({
      id: row.id,
      vitalSignId: row.vital_sign_id,
      patientId: row.patient_id,
      encounterId: row.encounter_id,
      vitalName: row.vital_name,
      vitalValue: row.vital_value,
      severity: row.severity,
      normalRange: row.normal_range,
      recommendedAction: row.recommended_action,
      acknowledged: row.acknowledged,
      acknowledgedBy: row.acknowledged_by,
      acknowledgedAt: row.acknowledged_at,
      createdAt: row.created_at,
    }));
  }
}
