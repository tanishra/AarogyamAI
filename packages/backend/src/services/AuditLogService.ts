import { createHash } from 'crypto';
import { Pool } from 'pg';

interface AuditLogEntry {
  userId: string;
  userName: string;
  userRole: string;
  actionType: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure';
  ipAddress: string;
  userAgent: string;
  requestId: string;
  errorDetails?: string;
}

interface AuditLogWithHash extends AuditLogEntry {
  id: string;
  timestamp: string;
  hash: string;
  previousHash: string | null;
}

export class AuditLogService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Compute SHA-256 hash for audit log entry with hash chaining
   */
  private computeHash(entry: AuditLogEntry, previousHash: string | null): string {
    const data = JSON.stringify({
      ...entry,
      previousHash,
    });
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create audit log entry with hash chaining for tamper-evidence
   */
  async createEntry(entry: AuditLogEntry): Promise<AuditLogWithHash> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get the last entry's hash
      const lastEntryResult = await client.query(
        'SELECT hash FROM audit_logs ORDER BY timestamp DESC LIMIT 1'
      );
      const previousHash = lastEntryResult.rows.length > 0 ? lastEntryResult.rows[0].hash : null;

      // Compute hash for new entry
      const hash = this.computeHash(entry, previousHash);

      // Insert new entry
      const result = await client.query(
        `INSERT INTO audit_logs (
          user_id, user_name, user_role, action_type, resource, resource_id,
          outcome, ip_address, user_agent, request_id, error_details, hash, previous_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          entry.userId,
          entry.userName,
          entry.userRole,
          entry.actionType,
          entry.resource,
          entry.resourceId || null,
          entry.outcome,
          entry.ipAddress,
          entry.userAgent,
          entry.requestId,
          entry.errorDetails || null,
          hash,
          previousHash,
        ]
      );

      await client.query('COMMIT');

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Verify integrity of audit log chain
   */
  async verifyIntegrity(startDate?: Date, endDate?: Date): Promise<{
    isValid: boolean;
    totalEntries: number;
    tamperedEntries: string[];
    message: string;
  }> {
    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (startDate) {
      params.push(startDate);
      query += ` AND timestamp >= $${params.length}`;
    }

    if (endDate) {
      params.push(endDate);
      query += ` AND timestamp <= $${params.length}`;
    }

    query += ' ORDER BY timestamp ASC';

    const result = await this.pool.query(query, params);
    const entries = result.rows;

    if (entries.length === 0) {
      return {
        isValid: true,
        totalEntries: 0,
        tamperedEntries: [],
        message: 'No entries to verify',
      };
    }

    const tamperedEntries: string[] = [];

    // Verify each entry's hash
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const previousHash = i === 0 ? null : entries[i - 1].hash;

      // Recompute hash
      const expectedHash = this.computeHash(
        {
          userId: entry.user_id,
          userName: entry.user_name,
          userRole: entry.user_role,
          actionType: entry.action_type,
          resource: entry.resource,
          resourceId: entry.resource_id,
          outcome: entry.outcome,
          ipAddress: entry.ip_address,
          userAgent: entry.user_agent,
          requestId: entry.request_id,
          errorDetails: entry.error_details,
        },
        previousHash
      );

      // Check if hash matches
      if (expectedHash !== entry.hash) {
        tamperedEntries.push(entry.id);
      }

      // Check if previous hash link is correct
      if (entry.previous_hash !== previousHash) {
        tamperedEntries.push(entry.id);
      }
    }

    return {
      isValid: tamperedEntries.length === 0,
      totalEntries: entries.length,
      tamperedEntries: [...new Set(tamperedEntries)],
      message: tamperedEntries.length === 0
        ? 'All entries verified successfully'
        : `${tamperedEntries.length} tampered entries detected`,
    };
  }

  /**
   * Search audit logs with filters
   */
  async search(filters: {
    userId?: string;
    actionType?: string;
    resource?: string;
    startDate?: Date;
    endDate?: Date;
    outcome?: 'success' | 'failure';
    page?: number;
    limit?: number;
  }): Promise<{
    items: AuditLogWithHash[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }> {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];

    if (filters.userId) {
      params.push(filters.userId);
      query += ` AND user_id = $${params.length}`;
    }

    if (filters.actionType) {
      params.push(filters.actionType);
      query += ` AND action_type = $${params.length}`;
    }

    if (filters.resource) {
      params.push(filters.resource);
      query += ` AND resource = $${params.length}`;
    }

    if (filters.startDate) {
      params.push(filters.startDate);
      query += ` AND timestamp >= $${params.length}`;
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      query += ` AND timestamp <= $${params.length}`;
    }

    if (filters.outcome) {
      params.push(filters.outcome);
      query += ` AND outcome = $${params.length}`;
    }

    // Get total count
    const countResult = await this.pool.query(
      query.replace('SELECT *', 'SELECT COUNT(*)'),
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);

    return {
      items: result.rows,
      total,
      page,
      limit,
      hasMore: offset + result.rows.length < total,
    };
  }
}
