import apiClient from '../client';
import type {
  RegistrationRequest,
  UserAccount,
  ActivityEntry,
  PaginatedResponse,
  ApproveRegistrationRequest,
  RejectRegistrationRequest,
  ChangeRoleRequest,
  ChangeStatusRequest,
  PasswordResetRequest,
  MFAUpdateRequest,
} from '../types';

export class UserManagementAPI {
  /**
   * Get all pending registration requests
   */
  static async getRegistrationRequests(): Promise<RegistrationRequest[]> {
    const response = await apiClient.get<RegistrationRequest[]>('/api/admin/registration-requests');
    return response.data;
  }

  /**
   * Approve a registration request
   */
  static async approveRegistration(id: string): Promise<void> {
    await apiClient.post(`/api/admin/registration-requests/${id}/approve`);
  }

  /**
   * Reject a registration request
   */
  static async rejectRegistration(id: string, reason: string): Promise<void> {
    await apiClient.post(`/api/admin/registration-requests/${id}/reject`, { reason });
  }

  /**
   * Get all users with pagination
   */
  static async getUsers(page: number = 1, pageSize: number = 50): Promise<PaginatedResponse<UserAccount>> {
    const response = await apiClient.get<PaginatedResponse<UserAccount>>('/api/admin/users', {
      params: { page, pageSize },
    });
    return response.data;
  }

  /**
   * Get a single user by ID
   */
  static async getUserById(id: string): Promise<UserAccount> {
    const response = await apiClient.get<UserAccount>(`/api/admin/users/${id}`);
    return response.data;
  }

  /**
   * Change a user's role
   */
  static async changeUserRole(userId: string, newRole: UserAccount['role']): Promise<void> {
    await apiClient.put(`/api/admin/users/${userId}/role`, { newRole });
  }

  /**
   * Change a user's account status (activate/deactivate)
   */
  static async changeUserStatus(userId: string, isActive: boolean, reason?: string): Promise<void> {
    await apiClient.put(`/api/admin/users/${userId}/status`, { isActive, reason });
  }

  /**
   * Initiate password reset for a user
   */
  static async initiatePasswordReset(userId: string): Promise<void> {
    await apiClient.post(`/api/admin/users/${userId}/password-reset`);
  }

  /**
   * Update MFA settings for a user
   */
  static async updateMFA(userId: string, enabled: boolean, method?: 'totp' | 'sms'): Promise<void> {
    await apiClient.put(`/api/admin/users/${userId}/mfa`, { enabled, method });
  }

  /**
   * Get user activity history
   */
  static async getUserActivity(
    userId: string,
    page: number = 1,
    pageSize: number = 50,
    filters?: {
      startDate?: string;
      endDate?: string;
      actionType?: string;
    }
  ): Promise<PaginatedResponse<ActivityEntry>> {
    const response = await apiClient.get<PaginatedResponse<ActivityEntry>>(
      `/api/admin/users/${userId}/activity`,
      {
        params: { page, pageSize, ...filters },
      }
    );
    return response.data;
  }
}
