/**
 * Example usage of the Audit Log schema and DynamoDB client
 * 
 * This file demonstrates how to:
 * 1. Create audit log entries
 * 2. Query audit logs
 * 3. Use GSIs for filtering
 * 4. Validate data with Zod
 */

import { getDynamoDBClient } from '../config/dynamodb';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { 
  AuditLogItem, 
  AuditLogSchema, 
  CreateAuditLogInput,
  AUDIT_LOG_TABLE_CONFIG,
  AuditActionTypes,
  AuditResourceTypes 
} from './audit-log';
import { createHash } from 'crypto';

/**
 * Example 1: Create a new audit log entry
 */
export async function createAuditLogExample(): Promise<void> {
  const client = getDynamoDBClient();
  
  // Prepare input data
  const input: CreateAuditLogInput = {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    userName: 'John Doe',
    userRole: 'Administrator',
    actionType: AuditActionTypes.USER_CREATED,
    resource: AuditResourceTypes.USER,
    resourceId: '123e4567-e89b-12d3-a456-426614174002',
    outcome: 'success',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    requestId: '123e4567-e89b-12d3-a456-426614174003',
  };
  
  // Generate computed fields
  const timestamp = Date.now();
  const id = crypto.randomUUID();
  
  // Compute hash (simplified - in production, include previousHash)
  const hashData = JSON.stringify({ ...input, id, timestamp });
  const hash = createHash('sha256').update(hashData).digest('hex');
  
  // Create complete audit log item
  const auditLog: AuditLogItem = {
    ...input,
    id,
    timestamp,
    hash,
  };
  
  // Validate with Zod
  const validated = AuditLogSchema.parse(auditLog);
  
  // Store in DynamoDB
  await client.send(new PutCommand({
    TableName: AUDIT_LOG_TABLE_CONFIG.tableName(process.env.NODE_ENV || 'dev'),
    Item: validated,
  }));
  
  console.log('Audit log created:', id);
}

/**
 * Example 2: Query audit logs by user
 */
export async function queryAuditLogsByUserExample(userId: string): Promise<AuditLogItem[]> {
  const client = getDynamoDBClient();
  
  const result = await client.send(new QueryCommand({
    TableName: AUDIT_LOG_TABLE_CONFIG.tableName(process.env.NODE_ENV || 'dev'),
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: {
      ':userId': userId,
    },
    ScanIndexForward: false, // Sort by timestamp descending (newest first)
    Limit: 100,
  }));
  
  return (result.Items || []) as AuditLogItem[];
}

/**
 * Example 3: Query audit logs by action type (using GSI)
 */
export async function queryAuditLogsByActionTypeExample(
  actionType: string,
  startTime?: number,
  endTime?: number
): Promise<AuditLogItem[]> {
  const client = getDynamoDBClient();
  
  let keyConditionExpression = 'actionType = :actionType';
  const expressionAttributeValues: Record<string, any> = {
    ':actionType': actionType,
  };
  
  // Add time range filter if provided
  if (startTime && endTime) {
    keyConditionExpression += ' AND #timestamp BETWEEN :startTime AND :endTime';
    expressionAttributeValues[':startTime'] = startTime;
    expressionAttributeValues[':endTime'] = endTime;
  }
  
  const result = await client.send(new QueryCommand({
    TableName: AUDIT_LOG_TABLE_CONFIG.tableName(process.env.NODE_ENV || 'dev'),
    IndexName: AUDIT_LOG_TABLE_CONFIG.gsi.actionTypeIndex.name,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: startTime && endTime ? { '#timestamp': 'timestamp' } : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ScanIndexForward: false,
  }));
  
  return (result.Items || []) as AuditLogItem[];
}

/**
 * Example 4: Query audit logs by resource (using GSI)
 */
export async function queryAuditLogsByResourceExample(
  resource: string,
  startTime?: number,
  endTime?: number
): Promise<AuditLogItem[]> {
  const client = getDynamoDBClient();
  
  let keyConditionExpression = 'resource = :resource';
  const expressionAttributeValues: Record<string, any> = {
    ':resource': resource,
  };
  
  if (startTime && endTime) {
    keyConditionExpression += ' AND #timestamp BETWEEN :startTime AND :endTime';
    expressionAttributeValues[':startTime'] = startTime;
    expressionAttributeValues[':endTime'] = endTime;
  }
  
  const result = await client.send(new QueryCommand({
    TableName: AUDIT_LOG_TABLE_CONFIG.tableName(process.env.NODE_ENV || 'dev'),
    IndexName: AUDIT_LOG_TABLE_CONFIG.gsi.resourceIndex.name,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: startTime && endTime ? { '#timestamp': 'timestamp' } : undefined,
    ExpressionAttributeValues: expressionAttributeValues,
    ScanIndexForward: false,
  }));
  
  return (result.Items || []) as AuditLogItem[];
}

/**
 * Example 5: Create audit log with TTL (auto-delete after 7 years)
 */
export async function createAuditLogWithTTLExample(): Promise<void> {
  const client = getDynamoDBClient();
  
  const input: CreateAuditLogInput = {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    userName: 'Jane Smith',
    userRole: 'DPO',
    actionType: AuditActionTypes.CONSENT_VIEWED,
    resource: AuditResourceTypes.CONSENT_RECORD,
    resourceId: '123e4567-e89b-12d3-a456-426614174004',
    outcome: 'success',
    ipAddress: '192.168.1.2',
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    requestId: '123e4567-e89b-12d3-a456-426614174005',
    // Set TTL to 7 years from now (compliance retention period)
    ttl: Math.floor(Date.now() / 1000) + (7 * 365 * 24 * 60 * 60),
  };
  
  const timestamp = Date.now();
  const id = crypto.randomUUID();
  const hashData = JSON.stringify({ ...input, id, timestamp });
  const hash = createHash('sha256').update(hashData).digest('hex');
  
  const auditLog: AuditLogItem = {
    ...input,
    id,
    timestamp,
    hash,
  };
  
  const validated = AuditLogSchema.parse(auditLog);
  
  await client.send(new PutCommand({
    TableName: AUDIT_LOG_TABLE_CONFIG.tableName(process.env.NODE_ENV || 'dev'),
    Item: validated,
  }));
  
  console.log('Audit log with TTL created:', id);
}

/**
 * Example 6: Validate audit log data before storing
 */
export function validateAuditLogExample(data: unknown): AuditLogItem | null {
  try {
    const validated = AuditLogSchema.parse(data);
    console.log('Validation successful');
    return validated;
  } catch (error) {
    console.error('Validation failed:', error);
    return null;
  }
}

// Example usage (commented out to prevent execution)
/*
async function main() {
  // Create an audit log
  await createAuditLogExample();
  
  // Query by user
  const userLogs = await queryAuditLogsByUserExample('123e4567-e89b-12d3-a456-426614174000');
  console.log('User logs:', userLogs.length);
  
  // Query by action type
  const loginLogs = await queryAuditLogsByActionTypeExample(AuditActionTypes.LOGIN_SUCCESS);
  console.log('Login logs:', loginLogs.length);
  
  // Query by resource
  const userResourceLogs = await queryAuditLogsByResourceExample(AuditResourceTypes.USER);
  console.log('User resource logs:', userResourceLogs.length);
  
  // Create with TTL
  await createAuditLogWithTTLExample();
}

main().catch(console.error);
*/
