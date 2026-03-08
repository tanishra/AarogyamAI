import { getDynamoDBClient } from '../config/dynamodb';
import { config } from '../config';
import {
  PutCommand,
  QueryCommand,
  ScanCommand,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { AuditLogEntry, SearchFilters, PaginatedResult } from './types';
import { randomUUID } from 'crypto';
import { query as pgQuery } from '../config/database';

/**
 * Audit Log Repository
 * 
 * Handles audit log operations in DynamoDB with PostgreSQL fallback
 * - Tries DynamoDB first
 * - Falls back to PostgreSQL if DynamoDB fails
 * - Logs errors but never breaks the application flow
 */
export class AuditLogRepository {
  private tableName: string;
  private client;
  private persistenceEnabled: boolean;
  private useDynamoDB: boolean;
  private dynamoDBHealthy: boolean;

  constructor() {
    this.tableName = config.aws.dynamodb.auditTable;
    this.client = getDynamoDBClient();
    this.persistenceEnabled =
      process.env.ENABLE_DYNAMODB_AUDIT === 'true' ||
      process.env.NODE_ENV === 'production';
    this.useDynamoDB = process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? true : false;
    this.dynamoDBHealthy = true; // Assume healthy initially
  }

  /**
   * Create a new audit log entry
   * Tries DynamoDB first, falls back to PostgreSQL
   */
  async create(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): Promise<AuditLogEntry> {
    const logEntry: AuditLogEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: Date.now(),
    };

    if (!this.persistenceEnabled) {
      return logEntry;
    }

    // Try DynamoDB first if configured and healthy
    if (this.useDynamoDB && this.dynamoDBHealthy) {
      try {
        await this.client.send(
          new PutCommand({
            TableName: this.tableName,
            Item: logEntry,
          })
        );
        console.log('[AuditLog] Successfully saved to DynamoDB');
        return logEntry;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.warn('[AuditLog] DynamoDB write failed, falling back to PostgreSQL:', message);
        this.dynamoDBHealthy = false; // Mark as unhealthy
        
        // Fall through to PostgreSQL fallback
      }
    }

    // Fallback to PostgreSQL
    try {
      await this.saveToPostgreSQL(logEntry);
      console.log('[AuditLog] Successfully saved to PostgreSQL (fallback)');
    } catch (pgError) {
      console.error('[AuditLog] PostgreSQL fallback also failed:', pgError);
      // Don't throw - we don't want audit logging to break the application
    }

    return logEntry;
  }

  /**
   * Save audit log to PostgreSQL (fallback)
   */
  private async saveToPostgreSQL(entry: AuditLogEntry): Promise<void> {
    await pgQuery(
      `INSERT INTO audit_logs (
        id, user_id, user_name, user_role, action_type, resource, 
        resource_id, outcome, ip_address, user_agent, request_id, 
        hash, timestamp, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
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
        entry.hash,
        entry.timestamp,
      ]
    );
  }

  /**
   * Search audit logs with filters and pagination
   * Tries DynamoDB first, falls back to PostgreSQL
   */
  async search(filters: SearchFilters): Promise<PaginatedResult<AuditLogEntry>> {
    const limit = filters.limit || 50;
    const page = filters.page || 1;

    let items: AuditLogEntry[] = [];

    // Try DynamoDB first if configured and healthy
    if (this.useDynamoDB && this.dynamoDBHealthy) {
      try {
        items = await this.searchDynamoDB(filters);
        console.log('[AuditLog] Successfully searched DynamoDB');
      } catch (error) {
        console.warn('[AuditLog] DynamoDB search failed, falling back to PostgreSQL:', error);
        this.dynamoDBHealthy = false;
        items = await this.searchPostgreSQL(filters);
      }
    } else {
      // Use PostgreSQL directly
      items = await this.searchPostgreSQL(filters);
    }

    // Sort by timestamp descending
    items.sort((a, b) => b.timestamp - a.timestamp);

    // Paginate results
    const total = items.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedItems = items.slice(startIndex, endIndex);

    return {
      items: paginatedItems,
      total,
      page,
      limit,
      hasMore: endIndex < total,
    };
  }

  /**
   * Search in DynamoDB
   */
  private async searchDynamoDB(filters: SearchFilters): Promise<AuditLogEntry[]> {
    // Use GSI if filtering by actionType or resource
    if (filters.actionType) {
      return await this.queryByActionType(filters.actionType, filters.startDate, filters.endDate);
    } else if (filters.resource) {
      return await this.queryByResource(filters.resource, filters.startDate, filters.endDate);
    } else if (filters.userId) {
      return await this.queryByUserId(filters.userId, filters.startDate, filters.endDate);
    } else {
      // Scan all items (expensive, should be avoided in production)
      return await this.scanAll();
    }
  }

  /**
   * Search in PostgreSQL (fallback)
   */
  private async searchPostgreSQL(filters: SearchFilters): Promise<AuditLogEntry[]> {
    let queryText = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
      params.push(filters.userId);
      queryText += ` AND user_id = $${paramIndex++}`;
    }

    if (filters.actionType) {
      params.push(filters.actionType);
      queryText += ` AND action_type = $${paramIndex++}`;
    }

    if (filters.resource) {
      params.push(filters.resource);
      queryText += ` AND resource = $${paramIndex++}`;
    }

    if (filters.startDate) {
      params.push(filters.startDate.getTime());
      queryText += ` AND timestamp >= $${paramIndex++}`;
    }

    if (filters.endDate) {
      params.push(filters.endDate.getTime());
      queryText += ` AND timestamp <= $${paramIndex++}`;
    }

    queryText += ' ORDER BY timestamp DESC LIMIT 1000';

    const result = await pgQuery(queryText, params);
    
    return result.map((row: any) => ({
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
      hash: row.hash,
      timestamp: row.timestamp,
    }));
  }

  /**
   * Find audit logs by user ID
   */
  async findByUser(userId: string, limit: number = 100): Promise<AuditLogEntry[]> {
    return this.queryByUserId(userId, undefined, undefined, limit);
  }

  /**
   * Find audit logs by resource
   */
  async findByResource(resource: string, limit: number = 100): Promise<AuditLogEntry[]> {
    return this.queryByResource(resource, undefined, undefined, limit);
  }

  /**
   * Query by userId (partition key)
   */
  private async queryByUserId(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000
  ): Promise<AuditLogEntry[]> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      Limit: limit,
      ScanIndexForward: false, // Sort descending
    };

    // Add timestamp range if provided
    if (startDate || endDate) {
      if (startDate && endDate) {
        params.KeyConditionExpression += ' AND #ts BETWEEN :start AND :end';
        params.ExpressionAttributeValues![':start'] = startDate.getTime();
        params.ExpressionAttributeValues![':end'] = endDate.getTime();
      } else if (startDate) {
        params.KeyConditionExpression += ' AND #ts >= :start';
        params.ExpressionAttributeValues![':start'] = startDate.getTime();
      } else if (endDate) {
        params.KeyConditionExpression += ' AND #ts <= :end';
        params.ExpressionAttributeValues![':end'] = endDate.getTime();
      }
      params.ExpressionAttributeNames = { '#ts': 'timestamp' };
    }

    const result = await this.client.send(new QueryCommand(params));
    return (result.Items || []) as AuditLogEntry[];
  }

  /**
   * Query by actionType using GSI
   */
  private async queryByActionType(
    actionType: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000
  ): Promise<AuditLogEntry[]> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: 'actionType-timestamp-index',
      KeyConditionExpression: 'actionType = :actionType',
      ExpressionAttributeValues: {
        ':actionType': actionType,
      },
      Limit: limit,
      ScanIndexForward: false,
    };

    if (startDate || endDate) {
      if (startDate && endDate) {
        params.KeyConditionExpression += ' AND #ts BETWEEN :start AND :end';
        params.ExpressionAttributeValues![':start'] = startDate.getTime();
        params.ExpressionAttributeValues![':end'] = endDate.getTime();
      } else if (startDate) {
        params.KeyConditionExpression += ' AND #ts >= :start';
        params.ExpressionAttributeValues![':start'] = startDate.getTime();
      } else if (endDate) {
        params.KeyConditionExpression += ' AND #ts <= :end';
        params.ExpressionAttributeValues![':end'] = endDate.getTime();
      }
      params.ExpressionAttributeNames = { '#ts': 'timestamp' };
    }

    const result = await this.client.send(new QueryCommand(params));
    return (result.Items || []) as AuditLogEntry[];
  }

  /**
   * Query by resource using GSI
   */
  private async queryByResource(
    resource: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 1000
  ): Promise<AuditLogEntry[]> {
    const params: QueryCommandInput = {
      TableName: this.tableName,
      IndexName: 'resource-timestamp-index',
      KeyConditionExpression: 'resource = :resource',
      ExpressionAttributeValues: {
        ':resource': resource,
      },
      Limit: limit,
      ScanIndexForward: false,
    };

    if (startDate || endDate) {
      if (startDate && endDate) {
        params.KeyConditionExpression += ' AND #ts BETWEEN :start AND :end';
        params.ExpressionAttributeValues![':start'] = startDate.getTime();
        params.ExpressionAttributeValues![':end'] = endDate.getTime();
      } else if (startDate) {
        params.KeyConditionExpression += ' AND #ts >= :start';
        params.ExpressionAttributeValues![':start'] = startDate.getTime();
      } else if (endDate) {
        params.KeyConditionExpression += ' AND #ts <= :end';
        params.ExpressionAttributeValues![':end'] = endDate.getTime();
      }
      params.ExpressionAttributeNames = { '#ts': 'timestamp' };
    }

    const result = await this.client.send(new QueryCommand(params));
    return (result.Items || []) as AuditLogEntry[];
  }

  /**
   * Scan all items (expensive operation, use with caution)
   */
  private async scanAll(): Promise<AuditLogEntry[]> {
    const items: AuditLogEntry[] = [];
    let lastEvaluatedKey: any = undefined;

    do {
      const params: any = {
        TableName: this.tableName,
        ExclusiveStartKey: lastEvaluatedKey,
      };

      const result = await this.client.send(new ScanCommand(params));
      items.push(...((result.Items || []) as AuditLogEntry[]));
      lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items;
  }
}
