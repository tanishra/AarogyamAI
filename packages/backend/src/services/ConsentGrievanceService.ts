import { Pool } from 'pg';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { EmailService } from './EmailService';

interface ConsentRecord {
  id: number;
  patient_id: number;
  patient_name: string;
  consent_type: string;
  data_categories: string[];
  processing_purposes: string[];
  granted_at: string;
  expires_at: string | null;
  status: 'active' | 'withdrawn' | 'expired';
  withdrawn_at: string | null;
}

interface Grievance {
  id: number;
  patient_id: number;
  patient_name: string;
  submission_date: string;
  status: 'pending' | 'investigating' | 'resolved' | 'escalated';
  description: string;
  affected_data: string;
  resolution_timeline: string;
  dpo_notes: string | null;
  resolved_at: string | null;
}

interface DataAccessRequest {
  id: number;
  patient_id: number;
  patient_name: string;
  request_type: 'access' | 'portability' | 'rectification';
  scope: string;
  submission_date: string;
  status: 'pending' | 'fulfilled';
  response_url: string | null;
  fulfilled_at: string | null;
}

export class ConsentGrievanceService {
  private pool: Pool;
  private auditRepo: AuditLogRepository;
  private emailService: EmailService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.auditRepo = new AuditLogRepository();
    this.emailService = new EmailService();
  }

  async getConsentRecords(patientId?: number, status?: string): Promise<ConsentRecord[]> {
    let query = `
      SELECT 
        cr.*,
        u.name as patient_name
      FROM consent_records cr
      LEFT JOIN users u ON cr.patient_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (patientId) {
      params.push(patientId);
      query += ` AND cr.patient_id = $${params.length}`;
    }

    if (status) {
      params.push(status);
      query += ` AND cr.status = $${params.length}`;
    }

    query += ` ORDER BY cr.granted_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async processConsentWithdrawal(
    withdrawalId: number,
    dpoId: string,
    dpoName: string,
    ipAddress: string,
    userAgent: string,
    requestId: string
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get withdrawal request
      const withdrawalResult = await client.query(
        'SELECT * FROM consent_withdrawal_requests WHERE id = $1',
        [withdrawalId]
      );

      if (withdrawalResult.rows.length === 0) {
        throw new Error('Withdrawal request not found');
      }

      const withdrawal = withdrawalResult.rows[0];

      // Update consent status
      await client.query(
        `UPDATE consent_records 
         SET status = 'withdrawn', withdrawn_at = NOW() 
         WHERE id = $1`,
        [withdrawal.consent_id]
      );

      // Update withdrawal request status
      await client.query(
        `UPDATE consent_withdrawal_requests 
         SET status = 'processed', processed_at = NOW(), processed_by = $1 
         WHERE id = $2`,
        [dpoId, withdrawalId]
      );

      // Get patient email
      const patientResult = await client.query(
        'SELECT email, name FROM users WHERE id = $1',
        [withdrawal.patient_id]
      );

      await client.query('COMMIT');

      // Send confirmation email
      if (patientResult.rows.length > 0) {
        const patient = patientResult.rows[0];
        await this.emailService.sendMFAChangeNotification(
          patient.email,
          patient.name,
          'disabled'
        );
      }

      // Create audit log
      await this.auditRepo.create({
        userId: dpoId,
        userName: dpoName,
        userRole: 'DPO',
        actionType: 'consent_withdrawal_processed',
        resource: 'consent_withdrawal',
        resourceId: withdrawalId.toString(),
        outcome: 'success',
        ipAddress,
        userAgent,
        requestId,
        hash: '',
      });

      console.log(`[INFO] Consent withdrawal processed: ${withdrawalId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getGrievances(status?: string): Promise<Grievance[]> {
    let query = `
      SELECT 
        g.*,
        u.name as patient_name
      FROM grievances g
      LEFT JOIN users u ON g.patient_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND g.status = $${params.length}`;
    }

    query += ` ORDER BY g.submission_date DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async updateGrievanceStatus(
    grievanceId: number,
    status: 'investigating' | 'resolved' | 'escalated',
    dpoNotes: string,
    dpoId: string,
    dpoName: string,
    ipAddress: string,
    userAgent: string,
    requestId: string
  ): Promise<Grievance> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const updateQuery = status === 'resolved'
        ? `UPDATE grievances 
           SET status = $1, dpo_notes = $2, resolved_at = NOW() 
           WHERE id = $3 
           RETURNING *`
        : `UPDATE grievances 
           SET status = $1, dpo_notes = $2 
           WHERE id = $3 
           RETURNING *`;

      const result = await client.query(updateQuery, [status, dpoNotes, grievanceId]);

      if (result.rows.length === 0) {
        throw new Error('Grievance not found');
      }

      const grievance = result.rows[0];

      // Get patient email
      const patientResult = await client.query(
        'SELECT email, name FROM users WHERE id = $1',
        [grievance.patient_id]
      );

      await client.query('COMMIT');

      // Send notification if resolved
      if (status === 'resolved' && patientResult.rows.length > 0) {
        const patient = patientResult.rows[0];
        await this.emailService.sendMFAChangeNotification(
          patient.email,
          patient.name,
          'enabled'
        );
      }

      // Create audit log
      await this.auditRepo.create({
        userId: dpoId,
        userName: dpoName,
        userRole: 'DPO',
        actionType: 'grievance_status_updated',
        resource: 'grievance',
        resourceId: grievanceId.toString(),
        outcome: 'success',
        ipAddress,
        userAgent,
        requestId,
        hash: '',
      });

      console.log(`[INFO] Grievance ${grievanceId} status updated to ${status}`);
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getDataAccessRequests(status?: string): Promise<DataAccessRequest[]> {
    let query = `
      SELECT 
        dar.*,
        u.name as patient_name
      FROM data_access_requests dar
      LEFT JOIN users u ON dar.patient_id = u.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND dar.status = $${params.length}`;
    }

    query += ` ORDER BY dar.submission_date DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  async fulfillDataAccessRequest(
    requestId: number,
    responseUrl: string,
    dpoId: string,
    dpoName: string,
    ipAddress: string,
    userAgent: string,
    auditRequestId: string
  ): Promise<DataAccessRequest> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE data_access_requests 
         SET status = 'fulfilled', response_url = $1, fulfilled_at = NOW() 
         WHERE id = $2 
         RETURNING *`,
        [responseUrl, requestId]
      );

      if (result.rows.length === 0) {
        throw new Error('Data access request not found');
      }

      const request = result.rows[0];

      // Get patient email
      const patientResult = await client.query(
        'SELECT email, name FROM users WHERE id = $1',
        [request.patient_id]
      );

      await client.query('COMMIT');

      // Send notification email
      if (patientResult.rows.length > 0) {
        const patient = patientResult.rows[0];
        await this.emailService.sendMFAChangeNotification(
          patient.email,
          patient.name,
          'enabled'
        );
      }

      // Create audit log
      await this.auditRepo.create({
        userId: dpoId,
        userName: dpoName,
        userRole: 'DPO',
        actionType: 'data_access_request_fulfilled',
        resource: 'data_access_request',
        resourceId: requestId.toString(),
        outcome: 'success',
        ipAddress,
        userAgent,
        requestId: auditRequestId,
        hash: '',
      });

      console.log(`[INFO] Data access request ${requestId} fulfilled`);
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
