import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserManagementService } from './UserManagementService';
import { UserRepository } from '../repositories/UserRepository';
import { RegistrationRequestRepository } from '../repositories/RegistrationRequestRepository';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { invalidateUserSessions } from '../auth/session';
import { User, RegistrationRequest } from '../repositories/types';

// Mock dependencies
vi.mock('../repositories/UserRepository');
vi.mock('../repositories/RegistrationRequestRepository');
vi.mock('../repositories/AuditLogRepository');
vi.mock('../auth/session');

describe('UserManagementService', () => {
  let service: UserManagementService;
  let userRepo: UserRepository;
  let registrationRepo: RegistrationRequestRepository;
  let auditRepo: AuditLogRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserManagementService();
    userRepo = (service as any).userRepo;
    registrationRepo = (service as any).registrationRepo;
    auditRepo = (service as any).auditRepo;
  });

  describe('approveRegistration', () => {
    it('should approve a pending registration request and create user account', async () => {
      const mockRequest: RegistrationRequest = {
        id: 'req-123',
        applicant_name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        requested_role: 'Doctor',
        status: 'pending',
        submitted_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const mockUser: User = {
        id: 'user-123',
        name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        password_hash: '$2b$10$test',
        role: 'Doctor',
        is_active: true,
        mfa_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(registrationRepo, 'findById').mockResolvedValue(mockRequest);
      vi.spyOn(registrationRepo, 'approve').mockResolvedValue({
        request: { ...mockRequest, status: 'approved' },
        user: mockUser,
      });
      vi.spyOn(auditRepo, 'create').mockResolvedValue({} as any);

      const result = await service.approveRegistration({
        registrationRequestId: 'req-123',
        processedBy: 'admin-123',
        processedByName: 'Admin User',
        processedByRole: 'Administrator',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'http-req-123',
      });

      expect(result.user.email).toBe('john.doe@example.com');
      expect(result.request.status).toBe('approved');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'registration_approved',
          resource: 'registration_request',
          outcome: 'success',
        })
      );
    });

    it('should throw error if registration request not found', async () => {
      vi.spyOn(registrationRepo, 'findById').mockResolvedValue(null);

      await expect(
        service.approveRegistration({
          registrationRequestId: 'req-999',
          processedBy: 'admin-123',
          processedByName: 'Admin User',
          processedByRole: 'Administrator',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('Registration request not found');
    });

    it('should throw error if registration request already processed', async () => {
      const mockRequest: RegistrationRequest = {
        id: 'req-123',
        applicant_name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        requested_role: 'Doctor',
        status: 'approved',
        submitted_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(registrationRepo, 'findById').mockResolvedValue(mockRequest);

      await expect(
        service.approveRegistration({
          registrationRequestId: 'req-123',
          processedBy: 'admin-123',
          processedByName: 'Admin User',
          processedByRole: 'Administrator',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('Registration request already approved');
    });
  });

  describe('rejectRegistration', () => {
    it('should reject a pending registration request', async () => {
      const mockRequest: RegistrationRequest = {
        id: 'req-123',
        applicant_name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        requested_role: 'Doctor',
        status: 'pending',
        submitted_at: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const rejectedRequest: RegistrationRequest = {
        ...mockRequest,
        status: 'rejected',
        rejection_reason: 'Invalid credentials',
      };

      vi.spyOn(registrationRepo, 'findById').mockResolvedValue(mockRequest);
      vi.spyOn(registrationRepo, 'reject').mockResolvedValue(rejectedRequest);
      vi.spyOn(auditRepo, 'create').mockResolvedValue({} as any);

      const result = await service.rejectRegistration({
        registrationRequestId: 'req-123',
        processedBy: 'admin-123',
        processedByName: 'Admin User',
        processedByRole: 'Administrator',
        reason: 'Invalid credentials',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'http-req-123',
      });

      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toBe('Invalid credentials');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'registration_rejected',
          resource: 'registration_request',
          outcome: 'success',
        })
      );
    });

    it('should throw error if registration request not found', async () => {
      vi.spyOn(registrationRepo, 'findById').mockResolvedValue(null);

      await expect(
        service.rejectRegistration({
          registrationRequestId: 'req-999',
          processedBy: 'admin-123',
          processedByName: 'Admin User',
          processedByRole: 'Administrator',
          reason: 'Invalid credentials',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('Registration request not found');
    });
  });

  describe('changeUserRole', () => {
    it('should change user role and invalidate sessions', async () => {
      const mockUser: User = {
        id: 'user-123',
        name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        password_hash: '$2b$10$test',
        role: 'Doctor',
        is_active: true,
        mfa_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const updatedUser: User = {
        ...mockUser,
        role: 'Administrator',
      };

      vi.spyOn(userRepo, 'findById').mockResolvedValue(mockUser);
      vi.spyOn(userRepo, 'update').mockResolvedValue(updatedUser);
      vi.mocked(invalidateUserSessions).mockResolvedValue(2);
      vi.spyOn(auditRepo, 'create').mockResolvedValue({} as any);

      const result = await service.changeUserRole({
        userId: 'user-123',
        newRole: 'Administrator',
        adminId: 'admin-123',
        adminName: 'Admin User',
        adminRole: 'Administrator',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'http-req-123',
      });

      expect(result.role).toBe('Administrator');
      expect(invalidateUserSessions).toHaveBeenCalledWith('user-123');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'role_changed',
          resource: 'user',
          outcome: 'success',
        })
      );
    });

    it('should prevent administrators from changing their own role', async () => {
      await expect(
        service.changeUserRole({
          userId: 'admin-123',
          newRole: 'Doctor',
          adminId: 'admin-123',
          adminName: 'Admin User',
          adminRole: 'Administrator',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('Cannot change your own role');
    });

    it('should throw error if user not found', async () => {
      vi.spyOn(userRepo, 'findById').mockResolvedValue(null);

      await expect(
        service.changeUserRole({
          userId: 'user-999',
          newRole: 'Administrator',
          adminId: 'admin-123',
          adminName: 'Admin User',
          adminRole: 'Administrator',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('User not found');
    });
  });

  describe('deactivateAccount', () => {
    it('should deactivate user account and terminate sessions', async () => {
      const mockUser: User = {
        id: 'user-123',
        name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        password_hash: '$2b$10$test',
        role: 'Doctor',
        is_active: true,
        mfa_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const deactivatedUser: User = {
        ...mockUser,
        is_active: false,
      };

      vi.spyOn(userRepo, 'findById').mockResolvedValue(mockUser);
      vi.spyOn(userRepo, 'update').mockResolvedValue(deactivatedUser);
      vi.mocked(invalidateUserSessions).mockResolvedValue(3);
      vi.spyOn(auditRepo, 'create').mockResolvedValue({} as any);

      const result = await service.deactivateAccount({
        userId: 'user-123',
        adminId: 'admin-123',
        adminName: 'Admin User',
        adminRole: 'Administrator',
        reason: 'Policy violation',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'http-req-123',
      });

      expect(result.is_active).toBe(false);
      expect(invalidateUserSessions).toHaveBeenCalledWith('user-123');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'account_deactivated',
          resource: 'user',
          outcome: 'success',
        })
      );
    });

    it('should prevent administrators from deactivating their own account', async () => {
      await expect(
        service.deactivateAccount({
          userId: 'admin-123',
          adminId: 'admin-123',
          adminName: 'Admin User',
          adminRole: 'Administrator',
          reason: 'Test',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('Cannot deactivate your own account');
    });

    it('should throw error if account already deactivated', async () => {
      const mockUser: User = {
        id: 'user-123',
        name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        password_hash: '$2b$10$test',
        role: 'Doctor',
        is_active: false,
        mfa_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(userRepo, 'findById').mockResolvedValue(mockUser);

      await expect(
        service.deactivateAccount({
          userId: 'user-123',
          adminId: 'admin-123',
          adminName: 'Admin User',
          adminRole: 'Administrator',
          reason: 'Test',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('User account is already deactivated');
    });
  });

  describe('activateAccount', () => {
    it('should activate user account', async () => {
      const mockUser: User = {
        id: 'user-123',
        name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        password_hash: '$2b$10$test',
        role: 'Doctor',
        is_active: false,
        mfa_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      const activatedUser: User = {
        ...mockUser,
        is_active: true,
      };

      vi.spyOn(userRepo, 'findById').mockResolvedValue(mockUser);
      vi.spyOn(userRepo, 'update').mockResolvedValue(activatedUser);
      vi.spyOn(auditRepo, 'create').mockResolvedValue({} as any);

      const result = await service.activateAccount({
        userId: 'user-123',
        adminId: 'admin-123',
        adminName: 'Admin User',
        adminRole: 'Administrator',
        reason: 'Issue resolved',
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'http-req-123',
      });

      expect(result.is_active).toBe(true);
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'account_activated',
          resource: 'user',
          outcome: 'success',
        })
      );
    });

    it('should throw error if account already active', async () => {
      const mockUser: User = {
        id: 'user-123',
        name: 'Dr. John Doe',
        email: 'john.doe@example.com',
        password_hash: '$2b$10$test',
        role: 'Doctor',
        is_active: true,
        mfa_enabled: false,
        created_at: new Date(),
        updated_at: new Date(),
      };

      vi.spyOn(userRepo, 'findById').mockResolvedValue(mockUser);

      await expect(
        service.activateAccount({
          userId: 'user-123',
          adminId: 'admin-123',
          adminName: 'Admin User',
          adminRole: 'Administrator',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('User account is already active');
    });

    it('should throw error if user not found', async () => {
      vi.spyOn(userRepo, 'findById').mockResolvedValue(null);

      await expect(
        service.activateAccount({
          userId: 'user-999',
          adminId: 'admin-123',
          adminName: 'Admin User',
          adminRole: 'Administrator',
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'http-req-123',
        })
      ).rejects.toThrow('User not found');
    });
  });
});
