import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { RegistrationRequest, User } from './types';

/**
 * Registration Request Repository
 * 
 * Handles registration request operations with transaction support
 */
export class RegistrationRequestRepository {
  /**
   * Find all pending registration requests
   */
  async findPending(): Promise<RegistrationRequest[]> {
    return query<RegistrationRequest>(
      `SELECT * FROM registration_requests 
       WHERE status = 'pending' 
       ORDER BY submitted_at ASC`
    );
  }

  /**
   * Find registration request by ID
   */
  async findById(id: string): Promise<RegistrationRequest | null> {
    const requests = await query<RegistrationRequest>(
      'SELECT * FROM registration_requests WHERE id = $1',
      [id]
    );
    return requests[0] || null;
  }

  /**
   * Create a new registration request
   */
  async create(data: {
    applicant_name: string;
    email: string;
    requested_role: 'Nurse' | 'Doctor';
    credentials?: string;
  }): Promise<RegistrationRequest> {
    const requests = await query<RegistrationRequest>(
      `INSERT INTO registration_requests 
       (applicant_name, email, requested_role, credentials, submitted_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), 'pending', NOW(), NOW())
       RETURNING *`,
      [data.applicant_name, data.email, data.requested_role, data.credentials]
    );
    return requests[0];
  }

  /**
   * Approve registration request and create user account
   * Uses transaction to ensure atomicity
   */
  async approve(
    requestId: string,
    processedBy: string,
    userData: {
      name: string;
      email: string;
      password_hash: string;
      role: User['role'];
    }
  ): Promise<{ request: RegistrationRequest; user: User }> {
    return transaction(async (client: PoolClient) => {
      // Update registration request
      const requestResult = await client.query<RegistrationRequest>(
        `UPDATE registration_requests 
         SET status = 'approved', processed_by = $1, processed_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND status = 'pending'
         RETURNING *`,
        [processedBy, requestId]
      );

      if (requestResult.rows.length === 0) {
        throw new Error('Registration request not found or already processed');
      }

      // Create user account
      const userResult = await client.query<User>(
        `INSERT INTO users (name, email, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, true, NOW(), NOW())
         RETURNING *`,
        [userData.name, userData.email, userData.password_hash, userData.role]
      );

      return {
        request: requestResult.rows[0],
        user: userResult.rows[0],
      };
    });
  }

  /**
   * Reject registration request
   */
  async reject(
    requestId: string,
    processedBy: string,
    reason: string
  ): Promise<RegistrationRequest | null> {
    const requests = await query<RegistrationRequest>(
      `UPDATE registration_requests 
       SET status = 'rejected', processed_by = $1, processed_at = NOW(), 
           rejection_reason = $2, updated_at = NOW()
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [processedBy, reason, requestId]
    );
    return requests[0] || null;
  }

  /**
   * Get all registration requests with optional status filter
   */
  async findAll(status?: RegistrationRequest['status']): Promise<RegistrationRequest[]> {
    if (status) {
      return query<RegistrationRequest>(
        'SELECT * FROM registration_requests WHERE status = $1 ORDER BY submitted_at DESC',
        [status]
      );
    }
    return query<RegistrationRequest>(
      'SELECT * FROM registration_requests ORDER BY submitted_at DESC'
    );
  }
}
