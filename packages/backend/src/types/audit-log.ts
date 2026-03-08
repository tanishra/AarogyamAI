import { z } from 'zod';

/**
 * DynamoDB Audit Log Item Schema
 * 
 * Table: audit_logs
 * Partition Key: userId (String)
 * Sort Key: timestamp (Number - Unix timestamp in milliseconds)
 * 
 * Global Secondary Indexes:
 * - actionType-timestamp-index: Partition Key: actionType, Sort Key: timestamp
 * - resource-timestamp-index: Partition Key: resource, Sort Key: timestamp
 */

/**
 * Zod schema for audit log validation
 */
export const AuditLogSchema = z.object({
  // Primary Keys
  userId: z.string().uuid().describe('User ID (partition key)'),
  timestamp: z.number().int().positive().describe('Unix timestamp in milliseconds (sort key)'),
  
  // Required Fields
  id: z.string().uuid().describe('Unique identifier for the audit log entry'),
  userName: z.string().min(1).describe('Name of the user who performed the action'),
  userRole: z.enum(['Patient', 'Nurse', 'Doctor', 'Administrator', 'DPO']).describe('Role of the user'),
  actionType: z.string().min(1).describe('Type of action performed (GSI partition key)'),
  resource: z.string().min(1).describe('Resource affected by the action (GSI partition key)'),
  outcome: z.enum(['success', 'failure']).describe('Outcome of the action'),
  ipAddress: z.string().ip().describe('IP address of the user'),
  userAgent: z.string().min(1).describe('User agent string from the request'),
  requestId: z.string().uuid().describe('Unique request identifier for tracing'),
  hash: z.string().length(64).describe('SHA-256 hash for tamper detection'),
  
  // Optional Fields
  resourceId: z.string().optional().describe('Specific resource identifier if applicable'),
  errorDetails: z.string().optional().describe('Error details if outcome is failure'),
  previousHash: z.string().length(64).optional().describe('Hash of previous entry for chain verification'),
  ttl: z.number().int().positive().optional().describe('TTL timestamp for automatic deletion'),
});

/**
 * TypeScript type inferred from Zod schema
 */
export type AuditLogItem = z.infer<typeof AuditLogSchema>;

/**
 * Type for creating a new audit log entry (without computed fields)
 */
export type CreateAuditLogInput = Omit<AuditLogItem, 'id' | 'timestamp' | 'hash' | 'previousHash'> & {
  resourceId?: string;
  errorDetails?: string;
  ttl?: number;
};

/**
 * DynamoDB table configuration constants
 */
export const AUDIT_LOG_TABLE_CONFIG = {
  tableName: (environment: string) => `admin-panel-audit-logs-${environment}`,
  partitionKey: 'userId',
  sortKey: 'timestamp',
  gsi: {
    actionTypeIndex: {
      name: 'actionType-timestamp-index',
      partitionKey: 'actionType',
      sortKey: 'timestamp',
    },
    resourceIndex: {
      name: 'resource-timestamp-index',
      partitionKey: 'resource',
      sortKey: 'timestamp',
    },
  },
  ttl: {
    attributeName: 'ttl',
    enabled: true,
  },
} as const;

/**
 * Common action types for audit logging
 */
export const AuditActionTypes = {
  // User Management
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_ACTIVATED: 'user.activated',
  USER_DEACTIVATED: 'user.deactivated',
  
  // Registration
  REGISTRATION_APPROVED: 'registration.approved',
  REGISTRATION_REJECTED: 'registration.rejected',
  
  // Authentication
  LOGIN_SUCCESS: 'auth.login_success',
  LOGIN_FAILURE: 'auth.login_failure',
  LOGOUT: 'auth.logout',
  SESSION_EXPIRED: 'auth.session_expired',
  MFA_ENABLED: 'auth.mfa_enabled',
  MFA_DISABLED: 'auth.mfa_disabled',
  
  // Password Management
  PASSWORD_RESET_INITIATED: 'password.reset_initiated',
  PASSWORD_CHANGED: 'password.changed',
  
  // Consent Management
  CONSENT_GRANTED: 'consent.granted',
  CONSENT_WITHDRAWN: 'consent.withdrawn',
  CONSENT_VIEWED: 'consent.viewed',
  
  // Grievance Management
  GRIEVANCE_CREATED: 'grievance.created',
  GRIEVANCE_UPDATED: 'grievance.updated',
  GRIEVANCE_RESOLVED: 'grievance.resolved',
  
  // Data Access
  PATIENT_DATA_ACCESSED: 'data.patient_accessed',
  PATIENT_DATA_EXPORTED: 'data.patient_exported',
  REPORT_GENERATED: 'report.generated',
  
  // Audit Operations
  AUDIT_LOG_VERIFIED: 'audit.log_verified',
  AUDIT_LOG_EXPORTED: 'audit.log_exported',
  ANOMALY_DETECTED: 'audit.anomaly_detected',
  ANOMALY_ACKNOWLEDGED: 'audit.anomaly_acknowledged',
  
  // Access Control
  UNAUTHORIZED_ACCESS_ATTEMPT: 'access.unauthorized_attempt',
  FORBIDDEN_ACTION_ATTEMPT: 'access.forbidden_attempt',
} as const;

/**
 * Common resource types for audit logging
 */
export const AuditResourceTypes = {
  USER: 'user',
  REGISTRATION_REQUEST: 'registration_request',
  SESSION: 'session',
  CONSENT_RECORD: 'consent_record',
  GRIEVANCE: 'grievance',
  DATA_ACCESS_REQUEST: 'data_access_request',
  PATIENT_DATA: 'patient_data',
  AUDIT_LOG: 'audit_log',
  REPORT: 'report',
  SYSTEM: 'system',
} as const;
