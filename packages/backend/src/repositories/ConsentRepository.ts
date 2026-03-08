import { query } from '../config/database';
import { ConsentRecord, ConsentWithdrawalRequest } from './types';

/**
 * Consent Repository
 * 
 * Handles consent record and withdrawal request operations
 */
export class ConsentRepository {
  /**
   * Find consent records by patient ID
   */
  async findByPatient(patientId: string): Promise<ConsentRecord[]> {
    return query<ConsentRecord>(
      `SELECT * FROM consent_records 
       WHERE patient_id = $1 
       ORDER BY granted_at DESC`,
      [patientId]
    );
  }

  /**
   * Find consent records by status
   */
  async findByStatus(status: ConsentRecord['status']): Promise<ConsentRecord[]> {
    return query<ConsentRecord>(
      `SELECT * FROM consent_records 
       WHERE status = $1 
       ORDER BY granted_at DESC`,
      [status]
    );
  }

  /**
   * Find consent record by ID
   */
  async findById(id: string): Promise<ConsentRecord | null> {
    const records = await query<ConsentRecord>(
      'SELECT * FROM consent_records WHERE id = $1',
      [id]
    );
    return records[0] || null;
  }

  /**
   * Create a new consent record
   */
  async create(data: {
    patient_id: string;
    consent_type: string;
    data_categories: string[];
    processing_purposes: string[];
    expires_at?: Date;
  }): Promise<ConsentRecord> {
    const records = await query<ConsentRecord>(
      `INSERT INTO consent_records 
       (patient_id, consent_type, data_categories, processing_purposes, granted_at, expires_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), $5, 'active', NOW(), NOW())
       RETURNING *`,
      [
        data.patient_id,
        data.consent_type,
        data.data_categories,
        data.processing_purposes,
        data.expires_at,
      ]
    );
    return records[0];
  }

  /**
   * Update consent record
   */
  async update(id: string, updates: Partial<ConsentRecord>): Promise<ConsentRecord | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'created_at' && value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const records = await query<ConsentRecord>(
      `UPDATE consent_records SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return records[0] || null;
  }

  /**
   * Withdraw consent
   */
  async withdraw(id: string): Promise<ConsentRecord | null> {
    const records = await query<ConsentRecord>(
      `UPDATE consent_records 
       SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return records[0] || null;
  }

  /**
   * Find all consent records with optional filters
   */
  async findAll(filters?: {
    patient_id?: string;
    status?: ConsentRecord['status'];
    consent_type?: string;
  }): Promise<ConsentRecord[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (filters?.patient_id) {
      conditions.push(`patient_id = $${paramIndex}`);
      values.push(filters.patient_id);
      paramIndex++;
    }

    if (filters?.status) {
      conditions.push(`status = $${paramIndex}`);
      values.push(filters.status);
      paramIndex++;
    }

    if (filters?.consent_type) {
      conditions.push(`consent_type = $${paramIndex}`);
      values.push(filters.consent_type);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return query<ConsentRecord>(
      `SELECT * FROM consent_records ${whereClause} ORDER BY granted_at DESC`,
      values
    );
  }

  /**
   * Get pending withdrawal requests
   */
  async getPendingWithdrawals(): Promise<ConsentWithdrawalRequest[]> {
    return query<ConsentWithdrawalRequest>(
      `SELECT * FROM consent_withdrawal_requests 
       WHERE status = 'pending' 
       ORDER BY requested_at ASC`
    );
  }

  /**
   * Create withdrawal request
   */
  async createWithdrawalRequest(data: {
    consent_id: string;
    patient_id: string;
  }): Promise<ConsentWithdrawalRequest> {
    const requests = await query<ConsentWithdrawalRequest>(
      `INSERT INTO consent_withdrawal_requests 
       (consent_id, patient_id, requested_at, status, created_at)
       VALUES ($1, $2, NOW(), 'pending', NOW())
       RETURNING *`,
      [data.consent_id, data.patient_id]
    );
    return requests[0];
  }

  /**
   * Process withdrawal request
   */
  async processWithdrawalRequest(
    requestId: string,
    processedBy: string
  ): Promise<ConsentWithdrawalRequest | null> {
    const requests = await query<ConsentWithdrawalRequest>(
      `UPDATE consent_withdrawal_requests 
       SET status = 'processed', processed_at = NOW(), processed_by = $1
       WHERE id = $2 AND status = 'pending'
       RETURNING *`,
      [processedBy, requestId]
    );
    return requests[0] || null;
  }
}
