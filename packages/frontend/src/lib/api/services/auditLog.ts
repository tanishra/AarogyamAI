import apiClient from '../client';
import type {
  AuditLogEntry,
  AnomalyAlert,
  AccessPattern,
  PaginatedResponse,
  AuditLogSearchParams,
} from '../types';

export class AuditLogAPI {
  /**
   * Search audit logs with filters
   */
  static async searchLogs(params: AuditLogSearchParams): Promise<PaginatedResponse<AuditLogEntry>> {
    const response = await apiClient.get<PaginatedResponse<AuditLogEntry>>('/api/audit/logs', {
      params,
    });
    return response.data;
  }

  /**
   * Get a single audit log entry by ID
   */
  static async getLogById(id: string): Promise<AuditLogEntry> {
    const response = await apiClient.get<AuditLogEntry>(`/api/audit/logs/${id}`);
    return response.data;
  }

  /**
   * Get access patterns for a patient
   */
  static async getAccessPatterns(
    patientId: string,
    startDate?: string,
    endDate?: string
  ): Promise<AccessPattern[]> {
    const response = await apiClient.get<AccessPattern[]>(`/api/audit/access-patterns/${patientId}`, {
      params: { startDate, endDate },
    });
    return response.data;
  }

  /**
   * Get unacknowledged anomaly alerts
   */
  static async getAnomalyAlerts(): Promise<AnomalyAlert[]> {
    const response = await apiClient.get<AnomalyAlert[]>('/api/audit/anomalies');
    return response.data;
  }

  /**
   * Acknowledge an anomaly alert
   */
  static async acknowledgeAnomaly(id: string): Promise<void> {
    await apiClient.post(`/api/audit/anomalies/${id}/acknowledge`);
  }

  /**
   * Verify audit log integrity
   */
  static async verifyIntegrity(startDate?: string, endDate?: string): Promise<{
    verified: boolean;
    totalEntries: number;
    tamperedEntries: string[];
    verifiedAt: string;
  }> {
    const response = await apiClient.post('/api/audit/verify', {
      startDate,
      endDate,
    });
    return response.data;
  }

  /**
   * Export audit logs
   */
  static async exportLogs(
    format: 'csv' | 'pdf',
    filters?: AuditLogSearchParams
  ): Promise<{ downloadUrl: string; expiresAt: string }> {
    const response = await apiClient.post('/api/audit/export', {
      format,
      filters,
    });
    return response.data;
  }
}
