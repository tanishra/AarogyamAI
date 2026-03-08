import apiClient from '../client';
import type {
  ConsentRecord,
  ConsentWithdrawalRequest,
  Grievance,
  DataAccessRequest,
  UpdateGrievanceRequest,
  FulfillDataAccessRequest,
} from '../types';

export class ConsentAPI {
  /**
   * Get consent records with optional filters
   */
  static async getConsentRecords(
    patientId?: string,
    status?: 'active' | 'withdrawn' | 'expired'
  ): Promise<ConsentRecord[]> {
    const response = await apiClient.get<ConsentRecord[]>('/api/consent/records', {
      params: { patientId, status },
    });
    return response.data;
  }

  /**
   * Get pending consent withdrawal requests
   */
  static async getWithdrawalRequests(): Promise<ConsentWithdrawalRequest[]> {
    const response = await apiClient.get<ConsentWithdrawalRequest[]>('/api/consent/withdrawal-requests');
    return response.data;
  }

  /**
   * Process a consent withdrawal request
   */
  static async processWithdrawal(id: string): Promise<void> {
    await apiClient.post(`/api/consent/withdrawal-requests/${id}/process`);
  }

  /**
   * Get all grievances
   */
  static async getGrievances(status?: Grievance['status']): Promise<Grievance[]> {
    const response = await apiClient.get<Grievance[]>('/api/grievances', {
      params: { status },
    });
    return response.data;
  }

  /**
   * Update grievance status
   */
  static async updateGrievance(id: string, status: Grievance['status'], dpoNotes?: string): Promise<void> {
    await apiClient.put(`/api/grievances/${id}`, { status, dpoNotes });
  }

  /**
   * Get data access requests
   */
  static async getDataAccessRequests(status?: DataAccessRequest['status']): Promise<DataAccessRequest[]> {
    const response = await apiClient.get<DataAccessRequest[]>('/api/data-access-requests', {
      params: { status },
    });
    return response.data;
  }

  /**
   * Fulfill a data access request
   */
  static async fulfillDataAccessRequest(id: string, responseDocumentUrl: string): Promise<void> {
    await apiClient.put(`/api/data-access-requests/${id}/fulfill`, { responseDocumentUrl });
  }

  /**
   * Generate compliance report
   */
  static async generateComplianceReport(
    startDate: string,
    endDate: string
  ): Promise<{ downloadUrl: string; expiresAt: string }> {
    const response = await apiClient.post('/api/compliance/reports', {
      startDate,
      endDate,
    });
    return response.data;
  }
}
