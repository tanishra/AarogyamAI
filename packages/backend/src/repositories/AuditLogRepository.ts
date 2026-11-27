import { AuditLogEntry, SearchFilters, PaginatedResult } from './types';
import { randomUUID } from 'crypto';
import { query as pgQuery, getDatabasePool } from '../config/database';
import { logger } from '../lib/logger';
import { computeAuditHash } from '../lib/auditHash';

/** Raw audit_logs table row (snake_case columns) */
interface AuditLogRow {
  id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  action_type: string;
  resource: string;
  resource_id: string | null;
  outcome: 'success' | 'failure';
  ip_address: string;
  user_agent: string;
  request_id: string;
  error_details: string | null;
  hash: string;
  previous_hash: string | null;
  timestamp: Date;
}

interface AccessorRow {
  user_id: string;
  user_name: string;
  user_role: string;
  access_count: number;
  last_access: Date;
}

interface TimelineRow {
  day: Date;
  count: number;
}

interface AccessTotalsRow {
  total: number;
  unique_accessors: number;
}

/**
 * Audit Log Repository
 *
 * PostgreSQL is the sole authoritative store — every entry is hash-chained
 * (previous_hash → sha256(entry + previousHash)) for tamper-evidence.
 * Audit failures are logged but never break the application flow.
 */
export class AuditLogRepository {
  /**
   * Create a new audit log entry.
   *
   * Every entry is hash-chained (previous_hash → sha256(entry + previousHash))
   * for tamper-evidence. Audit failures are logged but never break the
   * request flow.
   */
  async create(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    try {
      const { hash, previousHash } = await this.saveToPostgreSQL(logEntry);
      logEntry.hash = hash;
      logEntry.previousHash = previousHash;
    } catch (pgError) {
      logger.error('[AuditLog] PostgreSQL write failed:', pgError);
    }

    return logEntry;
  }

  /**
   * Save audit log to PostgreSQL inside a hash-chaining transaction.
   * Reads the previous chain tip, computes this entry's hash, and writes
   * both — making silent edits detectable by verifyIntegrity.
   */
  private async saveToPostgreSQL(
    entry: AuditLogEntry
  ): Promise<{ hash: string; previousHash: string | null }> {
    const pool = getDatabasePool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock the chain tip so concurrent writers cannot fork the chain
      const last = await client.query<{ hash: string }>(
        'SELECT hash FROM audit_logs ORDER BY timestamp DESC, id DESC LIMIT 1 FOR UPDATE'
      );
      const previousHash = last.rows.length > 0 ? last.rows[0].hash : null;
      const hash = computeAuditHash(
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
      await client.query(
        `INSERT INTO audit_logs (
          id, user_id, user_name, user_role, action_type, resource,
          resource_id, outcome, ip_address, user_agent, request_id,
          error_details, hash, previous_hash, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          entry.id,
          entry.userId,
          entry.userName,
          entry.userRole,
          entry.actionType,
          entry.resource,
          entry.resourceId,
          entry.outcome,
          entry.ipAddress,
          entry.userAgent,
          entry.requestId,
          entry.errorDetails ?? null,
          hash,
          previousHash,
          new Date(entry.timestamp),
        ]
      );
      await client.query('COMMIT');
      return { hash, previousHash };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search audit logs with filters and SQL-side pagination.
   */
  async search(filters: SearchFilters): Promise<PaginatedResult<AuditLogEntry>> {
    let whereClause = 'WHERE 1=1';
    const params: (string | Date)[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      params.push(filters.userId);
      whereClause += ` AND user_id = $${paramIndex++}`;
    }

    if (filters.actionType) {
      params.push(filters.actionType);
      whereClause += ` AND action_type = $${paramIndex++}`;
    }

    if (filters.resource) {
      params.push(filters.resource);
      whereClause += ` AND resource = $${paramIndex++}`;
    }

    if (filters.startDate) {
      params.push(filters.startDate);
      whereClause += ` AND timestamp >= $${paramIndex++}`;
    }

    if (filters.endDate) {
      params.push(filters.endDate);
      whereClause += ` AND timestamp <= $${paramIndex++}`;
    }

    const limit = filters.limit || 50;
    const page = filters.page || 1;

    const [countResult, rows] = await Promise.all([
      pgQuery<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM audit_logs ${whereClause}`,
        params
      ),
      pgQuery<AuditLogRow>(
        `SELECT * FROM audit_logs ${whereClause}
         ORDER BY timestamp DESC, id DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, (page - 1) * limit]
      ),
    ]);

    const total = countResult[0]?.total ?? 0;
    const items = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      actionType: row.action_type,
      resource: row.resource,
      resourceId: row.resource_id,
      outcome: row.outcome,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      requestId: row.request_id,
      errorDetails: row.error_details,
      hash: row.hash,
      previousHash: row.previous_hash,
      timestamp: row.timestamp instanceof Date ? row.timestamp.getTime() : row.timestamp,
    })) as AuditLogEntry[];

    return {
      items,
      total,
      page,
      limit,
      hasMore: page * limit < total,
    };
  }

  /**
   * Access-pattern analysis for a patient record: who accessed it, when,
   * and how often — computed from the audit_logs table.
   */
  async getAccessPatterns(
    patientId: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    accessors: Array<{
      userId: string;
      userName: string;
      role: string;
      accessCount: number;
      lastAccess: Date;
      isAnomalous: boolean;
    }>;
    timeline: Array<{ date: Date; count: number }>;
    statistics: { totalAccesses: number; uniqueAccessors: number };
  }> {
    const params: string[] = [patientId];
    let rangeClause = '';
    if (startDate) {
      params.push(startDate);
      rangeClause += ` AND timestamp >= $${params.length}`;
    }
    if (endDate) {
      params.push(endDate);
      rangeClause += ` AND timestamp <= $${params.length}`;
    }

    const [accessors, timeline, totals] = await Promise.all([
      pgQuery<AccessorRow>(
        `SELECT
          user_id,
          user_name,
          user_role,
          COUNT(*)::int AS access_count,
          MAX(timestamp) AS last_access
        FROM audit_logs
        WHERE resource_id = $1${rangeClause}
        GROUP BY user_id, user_name, user_role
        ORDER BY access_count DESC`,
        params
      ),
      pgQuery<TimelineRow>(
        `SELECT
          date_trunc('day', timestamp) AS day,
          COUNT(*)::int AS count
        FROM audit_logs
        WHERE resource_id = $1${rangeClause}
        GROUP BY 1
        ORDER BY 1`,
        params
      ),
      pgQuery<AccessTotalsRow>(
        `SELECT COUNT(*)::int AS total, COUNT(DISTINCT user_id)::int AS unique_accessors
        FROM audit_logs
        WHERE resource_id = $1${rangeClause}`,
        params
      ),
    ]);

    const totalAccesses = totals[0]?.total ?? 0;
    const uniqueAccessors = totals[0]?.unique_accessors ?? 0;

    // Anomaly heuristic: an accessor holding >50% of accesses on a record
    // with meaningful volume (>=10 total) is flagged for review.
    const dominantThreshold = totalAccesses >= 10 ? totalAccesses * 0.5 : Infinity;

    return {
      accessors: accessors.map((row) => ({
        userId: row.user_id,
        userName: row.user_name,
        role: row.user_role,
        accessCount: row.access_count,
        lastAccess: row.last_access,
        isAnomalous: row.access_count > dominantThreshold,
      })),
      timeline: timeline.map((row) => ({
        date: row.day,
        count: row.count,
      })),
      statistics: {
        totalAccesses,
        uniqueAccessors,
      },
    };
  }
}
