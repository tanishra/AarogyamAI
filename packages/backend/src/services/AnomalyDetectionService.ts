import { Pool } from 'pg';
import { AuditLogRepository } from '../repositories/AuditLogRepository';

interface AnomalyAlert {
  id: string;
  user_id: string;
  user_name: string;
  trigger_condition: string;
  details: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
}

export class AnomalyDetectionService {
  private pool: Pool;
  private auditRepo: AuditLogRepository;

  constructor(pool: Pool) {
    this.pool = pool;
    this.auditRepo = new AuditLogRepository();
  }

  /**
   * Detect high-frequency access (>50 accesses in 60 minutes)
   */
  async detectHighFrequencyAccess(): Promise<AnomalyAlert[]> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await this.pool.query(
      `SELECT 
        user_id,
        user_name,
        COUNT(*) as access_count
      FROM audit_logs
      WHERE 
        timestamp >= $1
        AND action_type LIKE '%access%'
        AND resource = 'patient_record'
      GROUP BY user_id, user_name
      HAVING COUNT(*) > 50`,
      [oneHourAgo]
    );

    const alerts: AnomalyAlert[] = [];

    for (const row of result.rows) {
      // Check if alert already exists
      const existingAlert = await this.pool.query(
        `SELECT id FROM anomaly_alerts 
         WHERE user_id = $1 
         AND trigger_condition = 'high_frequency_access' 
         AND timestamp >= $2
         AND acknowledged = false`,
        [row.user_id, oneHourAgo]
      );

      if (existingAlert.rows.length === 0) {
        // Create new alert
        const alertResult = await this.pool.query(
          `INSERT INTO anomaly_alerts (
            user_id, user_name, trigger_condition, details, acknowledged
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING *`,
          [
            row.user_id,
            row.user_name,
            'high_frequency_access',
            `${row.access_count} patient record accesses in the last 60 minutes`,
            false,
          ]
        );

        alerts.push(alertResult.rows[0]);
      }
    }

    return alerts;
  }

  /**
   * Detect off-hours access (10 PM - 6 AM)
   */
  async detectOffHoursAccess(): Promise<AnomalyAlert[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.pool.query(
      `SELECT 
        user_id,
        user_name,
        timestamp
      FROM audit_logs
      WHERE 
        timestamp >= $1
        AND action_type LIKE '%access%'
        AND resource = 'patient_record'
        AND (
          EXTRACT(HOUR FROM timestamp) >= 22 
          OR EXTRACT(HOUR FROM timestamp) < 6
        )`,
      [today]
    );

    const alerts: AnomalyAlert[] = [];

    for (const row of result.rows) {
      // Check if alert already exists for this access
      const existingAlert = await this.pool.query(
        `SELECT id FROM anomaly_alerts 
         WHERE user_id = $1 
         AND trigger_condition = 'off_hours_access' 
         AND timestamp >= $2
         AND acknowledged = false`,
        [row.user_id, row.timestamp]
      );

      if (existingAlert.rows.length === 0) {
        // Create new alert
        const alertResult = await this.pool.query(
          `INSERT INTO anomaly_alerts (
            user_id, user_name, trigger_condition, details, acknowledged
          ) VALUES ($1, $2, $3, $4, $5)
          RETURNING *`,
          [
            row.user_id,
            row.user_name,
            'off_hours_access',
            `Patient record accessed at ${new Date(row.timestamp).toLocaleString()}`,
            false,
          ]
        );

        alerts.push(alertResult.rows[0]);
      }
    }

    return alerts;
  }

  /**
   * Detect statistical anomalies (>3 standard deviations from mean)
   */
  async detectStatisticalAnomalies(): Promise<{
    anomalousUsers: Array<{ userId: string; userName: string; accessCount: number; zScore: number }>;
    mean: number;
    stdDev: number;
  }> {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get access counts per user
    const result = await this.pool.query(
      `SELECT 
        user_id,
        user_name,
        COUNT(*) as access_count
      FROM audit_logs
      WHERE 
        timestamp >= $1
        AND action_type LIKE '%access%'
        AND resource = 'patient_record'
      GROUP BY user_id, user_name`,
      [last30Days]
    );

    if (result.rows.length === 0) {
      return { anomalousUsers: [], mean: 0, stdDev: 0 };
    }

    // Calculate mean
    const accessCounts = result.rows.map(r => parseInt(r.access_count));
    const mean = accessCounts.reduce((a, b) => a + b, 0) / accessCounts.length;

    // Calculate standard deviation
    const variance = accessCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / accessCounts.length;
    const stdDev = Math.sqrt(variance);

    // Find anomalies (>3 standard deviations)
    const anomalousUsers = result.rows
      .map(row => {
        const count = parseInt(row.access_count);
        const zScore = (count - mean) / stdDev;
        return {
          userId: row.user_id,
          userName: row.user_name,
          accessCount: count,
          zScore,
        };
      })
      .filter(user => user.zScore > 3);

    // Create alerts for anomalous users
    for (const user of anomalousUsers) {
      const existingAlert = await this.pool.query(
        `SELECT id FROM anomaly_alerts 
         WHERE user_id = $1 
         AND trigger_condition = 'statistical_anomaly' 
         AND timestamp >= $2
         AND acknowledged = false`,
        [user.userId, last30Days]
      );

      if (existingAlert.rows.length === 0) {
        await this.pool.query(
          `INSERT INTO anomaly_alerts (
            user_id, user_name, trigger_condition, details, acknowledged
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            user.userId,
            user.userName,
            'statistical_anomaly',
            `Access frequency (${user.accessCount}) is ${user.zScore.toFixed(2)} standard deviations above mean`,
            false,
          ]
        );
      }
    }

    return { anomalousUsers, mean, stdDev };
  }

  /**
   * Get unacknowledged anomaly alerts
   */
  async getUnacknowledgedAlerts(): Promise<AnomalyAlert[]> {
    const result = await this.pool.query(
      `SELECT * FROM anomaly_alerts 
       WHERE acknowledged = false 
       ORDER BY timestamp DESC`
    );

    return result.rows;
  }

  /**
   * Acknowledge anomaly alert
   */
  async acknowledgeAnomaly(
    alertId: string,
    adminId: string,
    adminName: string,
    ipAddress: string,
    userAgent: string,
    requestId: string
  ): Promise<AnomalyAlert> {
    const result = await this.pool.query(
      `UPDATE anomaly_alerts 
       SET acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [adminId, alertId]
    );

    if (result.rows.length === 0) {
      throw new Error('Anomaly alert not found');
    }

    // Create audit log entry
    await this.auditRepo.create({
      userId: adminId,
      userName: adminName,
      userRole: 'Administrator',
      actionType: 'anomaly_acknowledged',
      resource: 'anomaly_alert',
      resourceId: alertId,
      outcome: 'success',
      ipAddress,
      userAgent,
      requestId,
      hash: '',
    });

    return result.rows[0];
  }

  /**
   * Run all anomaly detection checks
   */
  async runAllChecks(): Promise<{
    highFrequency: AnomalyAlert[];
    offHours: AnomalyAlert[];
    statistical: { anomalousUsers: any[]; mean: number; stdDev: number };
  }> {
    const [highFrequency, offHours, statistical] = await Promise.all([
      this.detectHighFrequencyAccess(),
      this.detectOffHoursAccess(),
      this.detectStatisticalAnomalies(),
    ]);

    return { highFrequency, offHours, statistical };
  }
}
