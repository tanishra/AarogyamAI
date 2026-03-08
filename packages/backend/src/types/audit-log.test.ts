import { describe, it, expect } from 'vitest';
import { AuditLogSchema, AuditActionTypes, AuditResourceTypes, AUDIT_LOG_TABLE_CONFIG } from './audit-log';
import type { AuditLogItem } from './audit-log';

describe('AuditLogSchema', () => {
  const validAuditLog: AuditLogItem = {
    userId: '123e4567-e89b-12d3-a456-426614174000',
    timestamp: Date.now(),
    id: '123e4567-e89b-12d3-a456-426614174001',
    userName: 'John Doe',
    userRole: 'Administrator',
    actionType: AuditActionTypes.USER_CREATED,
    resource: AuditResourceTypes.USER,
    resourceId: '123e4567-e89b-12d3-a456-426614174002',
    outcome: 'success',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    requestId: '123e4567-e89b-12d3-a456-426614174003',
    hash: 'a'.repeat(64),
  };

  it('should validate a correct audit log entry', () => {
    const result = AuditLogSchema.safeParse(validAuditLog);
    expect(result.success).toBe(true);
  });

  it('should reject audit log with invalid userId (not UUID)', () => {
    const invalid = { ...validAuditLog, userId: 'not-a-uuid' };
    const result = AuditLogSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject audit log with invalid timestamp (negative)', () => {
    const invalid = { ...validAuditLog, timestamp: -1 };
    const result = AuditLogSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject audit log with invalid userRole', () => {
    const invalid = { ...validAuditLog, userRole: 'InvalidRole' };
    const result = AuditLogSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject audit log with invalid outcome', () => {
    const invalid = { ...validAuditLog, outcome: 'pending' };
    const result = AuditLogSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject audit log with invalid IP address', () => {
    const invalid = { ...validAuditLog, ipAddress: 'not-an-ip' };
    const result = AuditLogSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should reject audit log with invalid hash length', () => {
    const invalid = { ...validAuditLog, hash: 'tooshort' };
    const result = AuditLogSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it('should accept audit log with optional fields', () => {
    const withOptional: AuditLogItem = {
      ...validAuditLog,
      errorDetails: 'Some error occurred',
      previousHash: 'b'.repeat(64),
      ttl: Math.floor(Date.now() / 1000) + 86400,
    };
    const result = AuditLogSchema.safeParse(withOptional);
    expect(result.success).toBe(true);
  });

  it('should accept audit log without optional fields', () => {
    const { resourceId, ...withoutOptional } = validAuditLog;
    const result = AuditLogSchema.safeParse(withoutOptional);
    expect(result.success).toBe(true);
  });

  it('should reject audit log with missing required fields', () => {
    const { userName, ...incomplete } = validAuditLog;
    const result = AuditLogSchema.safeParse(incomplete);
    expect(result.success).toBe(false);
  });

  it('should accept IPv6 addresses', () => {
    const withIPv6 = { ...validAuditLog, ipAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334' };
    const result = AuditLogSchema.safeParse(withIPv6);
    expect(result.success).toBe(true);
  });
});

describe('AUDIT_LOG_TABLE_CONFIG', () => {
  it('should generate correct table name for environment', () => {
    expect(AUDIT_LOG_TABLE_CONFIG.tableName('dev')).toBe('admin-panel-audit-logs-dev');
    expect(AUDIT_LOG_TABLE_CONFIG.tableName('prod')).toBe('admin-panel-audit-logs-prod');
  });

  it('should have correct partition and sort keys', () => {
    expect(AUDIT_LOG_TABLE_CONFIG.partitionKey).toBe('userId');
    expect(AUDIT_LOG_TABLE_CONFIG.sortKey).toBe('timestamp');
  });

  it('should have correct GSI configuration', () => {
    expect(AUDIT_LOG_TABLE_CONFIG.gsi.actionTypeIndex.name).toBe('actionType-timestamp-index');
    expect(AUDIT_LOG_TABLE_CONFIG.gsi.actionTypeIndex.partitionKey).toBe('actionType');
    expect(AUDIT_LOG_TABLE_CONFIG.gsi.actionTypeIndex.sortKey).toBe('timestamp');

    expect(AUDIT_LOG_TABLE_CONFIG.gsi.resourceIndex.name).toBe('resource-timestamp-index');
    expect(AUDIT_LOG_TABLE_CONFIG.gsi.resourceIndex.partitionKey).toBe('resource');
    expect(AUDIT_LOG_TABLE_CONFIG.gsi.resourceIndex.sortKey).toBe('timestamp');
  });

  it('should have TTL enabled', () => {
    expect(AUDIT_LOG_TABLE_CONFIG.ttl.enabled).toBe(true);
    expect(AUDIT_LOG_TABLE_CONFIG.ttl.attributeName).toBe('ttl');
  });
});

describe('AuditActionTypes', () => {
  it('should have user management action types', () => {
    expect(AuditActionTypes.USER_CREATED).toBe('user.created');
    expect(AuditActionTypes.USER_ROLE_CHANGED).toBe('user.role_changed');
    expect(AuditActionTypes.USER_ACTIVATED).toBe('user.activated');
    expect(AuditActionTypes.USER_DEACTIVATED).toBe('user.deactivated');
  });

  it('should have authentication action types', () => {
    expect(AuditActionTypes.LOGIN_SUCCESS).toBe('auth.login_success');
    expect(AuditActionTypes.LOGIN_FAILURE).toBe('auth.login_failure');
    expect(AuditActionTypes.LOGOUT).toBe('auth.logout');
  });

  it('should have consent management action types', () => {
    expect(AuditActionTypes.CONSENT_GRANTED).toBe('consent.granted');
    expect(AuditActionTypes.CONSENT_WITHDRAWN).toBe('consent.withdrawn');
  });
});

describe('AuditResourceTypes', () => {
  it('should have all required resource types', () => {
    expect(AuditResourceTypes.USER).toBe('user');
    expect(AuditResourceTypes.CONSENT_RECORD).toBe('consent_record');
    expect(AuditResourceTypes.GRIEVANCE).toBe('grievance');
    expect(AuditResourceTypes.PATIENT_DATA).toBe('patient_data');
    expect(AuditResourceTypes.AUDIT_LOG).toBe('audit_log');
  });
});
