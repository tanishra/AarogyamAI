import { query } from '../config/database';
import { DataAccessRequest } from './types';

/**
 * Data Access Request Repository
 * 
 * Handles patient data access request operations
 */
export class DataAccessRequestRepository {
  /**
   * Find all pending data access requests
   */
  async findPending(): Promise<DataAccessRequest[]> {
    return query<DataAccessRequest>(
      `SELECT * FROM data_access_requests 
       WHERE status = 'pending' 
       ORDER BY submitted_at ASC`
    );
  }

  /**
   * Find data access request by ID
   */
  async findById(id: string): Promise<DataAccessRequest | null> {
    const requests = await query<DataAccessRequest>(
      'SELECT * FROM data_access_requests WHERE id = $1',
      [id]
    );
    return requests[0] || null;
  }

  /**
   * Find data access requests by patient ID
   */
  async findByPatient(patientId: string): Promise<DataAccessRequest[]> {
    return query<DataAccessRequest>(
      `SELECT * FROM data_access_requests 
       WHERE patient_id = $1 
       ORDER BY submitted_at DESC`,
      [patientId]
    );
  }

  /**
   * Create a new data access request
   */
  async create(data: {
    patient_id: string;
    request_type: DataAccessRequest['request_type'];
    requested_scope: string;
  }): Promise<DataAccessRequest> {
    const requests = await query<DataAccessRequest>(
      `INSERT INTO data_access_requests 
       (patient_id, request_type, requested_scope, submitted_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), 'pending', NOW(), NOW())
       RETURNING *`,
      [data.patient_id, data.request_type, data.requested_scope]
    );
    return requests[0];
  }

  /**
   * Fulfill a data access request
   */
  async fulfill(
    id: string,
    fulfilledBy: string,
    responseDocumentUrl?: string
  ): Promise<DataAccessRequest | null> {
    const requests = await query<DataAccessRequest>(
      `UPDATE data_access_requests 
       SET status = 'fulfilled', 
           fulfilled_at = NOW(), 
           fulfilled_by = $1,
           response_document_url = $2,
           updated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [fulfilledBy, responseDocumentUrl, id]
    );
    return requests[0] || null;
  }

  /**
   * Find all data access requests with optional filters
   */
  async findAll(filters?: {
    patient_id?: string;
    status?: DataAccessRequest['status'];
    request_type?: DataAccessRequest['request_type'];
  }): Promise<DataAccessRequest[]> {
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

    if (filters?.request_type) {
      conditions.push(`request_type = $${paramIndex}`);
      values.push(filters.request_type);
      paramIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    return query<DataAccessRequest>(
      `SELECT * FROM data_access_requests ${whereClause} ORDER BY submitted_at DESC`,
      values
    );
  }

  /**
   * Find requests pending for more than specified hours
   */
  async findOverdue(hours: number = 72): Promise<DataAccessRequest[]> {
    return query<DataAccessRequest>(
      `SELECT * FROM data_access_requests 
       WHERE status = 'pending' 
       AND submitted_at < NOW() - INTERVAL '${hours} hours'
       ORDER BY submitted_at ASC`
    );
  }

  /**
   * Update data access request
   */
  async update(id: string, updates: Partial<DataAccessRequest>): Promise<DataAccessRequest | null> {
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

    const requests = await query<DataAccessRequest>(
      `UPDATE data_access_requests SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    return requests[0] || null;
  }
}
