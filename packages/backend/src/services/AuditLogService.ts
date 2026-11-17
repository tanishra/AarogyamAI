import { Pool } from 'pg';
import { computeAuditHash } from '../lib/auditHash';

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
   * Compute SHA-256 hash for audit log entry with hash chaining.
   * Hashes the canonical field set that verifyIntegrity reconstructs.
   */
  private computeHash(entry: AuditLogEntry, previousHash: string | null): string {
    return computeAuditHash(
      {
        userId: entry.userId,
        userName: entry.userName,
        userRole: entry.userRole,
        actionType: entry.actionType,
        resource: entry.resource,
        resourceId: entry.resourceId,
        outcome: entry.outcome,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        requestId: entry.requestId,
        errorDetails: entry.errorDetails,
      },
      previousHash
    );
  }

  /**
   * Create audit log entry with hash chaining for tamper-evidence
   */
  async createEntry(entry: AuditLogEntry): Promise<AuditLogWithHash> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get the last entry's hash — locked so concurrent writers cannot fork the chain
      const lastEntryResult = await client.query(
        'SELECT hash FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT 1 FOR UPDATE'
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
    // Keyset-batched scan — never loads the whole table into memory.
    const BATCH = 1000;
    const tamperedEntries: string[] = [];
    let totalEntries = 0;
    let lastTs: Date | null = null;
    let lastId: string | null = null;
    let previousHash: string | null = null;
    let predecessorLoaded = false;

    for (;;) {
      const params: any[] = [];
      let where = 'WHERE 1=1';
      if (startDate) { params.push(startDate); where += ` AND timestamp >= $${params.length}`; }
      if (endDate) { params.push(endDate); where += ` AND timestamp <= $${params.length}`; }
      if (lastTs !== null) {
        params.push(lastTs, lastId);
        where += ` AND (timestamp, id) > ($${params.length - 1}, $${params.length})`;
      }
      params.push(BATCH);
      const result = await this.pool.query(
        `SELECT * FROM audit_logs ${where} ORDER BY timestamp ASC, id ASC LIMIT $${params.length}`,
        params
      );
      const batch = result.rows;
      if (batch.length === 0) break;

      for (const entry of batch) {
        if (!predecessorLoaded) {
          // For a ranged verify, the first row's real predecessor may sit
          // before startDate — fetch it so the chain link is checked, not
          // assumed null (which would false-positive a valid chain).
          const prev = await this.pool.query(
            `SELECT hash FROM audit_logs
             WHERE (timestamp, id) < ($1, $2)
             ORDER BY timestamp DESC, id DESC LIMIT 1`,
            [entry.timestamp, entry.id]
          );
          previousHash = prev.rows[0]?.hash ?? null;
          predecessorLoaded = true;
        }

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

        if (expectedHash !== entry.hash || entry.previous_hash !== previousHash) {
          tamperedEntries.push(entry.id);
        }

        previousHash = entry.hash;
        totalEntries++;
      }

      const last = batch[batch.length - 1];
      lastTs = last.timestamp;
      lastId = last.id;
      if (batch.length < BATCH) break;
    }

    if (totalEntries === 0) {
      return {
        isValid: true,
        totalEntries: 0,
        tamperedEntries: [],
        message: 'No entries to verify',
      };
    }

    return {
      isValid: tamperedEntries.length === 0,
      totalEntries,
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
