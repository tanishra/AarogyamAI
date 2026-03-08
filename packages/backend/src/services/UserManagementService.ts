import { UserRepository } from '../repositories/UserRepository';
import { RegistrationRequestRepository } from '../repositories/RegistrationRequestRepository';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { invalidateUserSessions } from '../auth/session';
import { User, RegistrationRequest } from '../repositories/types';
import { randomBytes } from 'crypto';

/**
 * User Management Service
 * 
 * Implements core user management operations:
 * - Registration approval/rejection
 * - Role management
 * - Account activation/deactivation
 */

export interface ApproveRegistrationParams {
  registrationRequestId: string;
  processedBy: string;
  processedByName: string;
  processedByRole: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export interface RejectRegistrationParams {
  registrationRequestId: string;
  processedBy: string;
  processedByName: string;
  processedByRole: string;
  reason: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export interface ChangeRoleParams {
  userId: string;
  newRole: User['role'];
  adminId: string;
  adminName: string;
  adminRole: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export interface ActivateAccountParams {
  userId: string;
  adminId: string;
  adminName: string;
  adminRole: string;
  reason?: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export interface DeactivateAccountParams {
  userId: string;
  adminId: string;
  adminName: string;
  adminRole: string;
  reason: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export class UserManagementService {
  private userRepo: UserRepository;
  private registrationRepo: RegistrationRequestRepository;
  private auditRepo: AuditLogRepository;

  constructor() {
    this.userRepo = new UserRepository();
    this.registrationRepo = new RegistrationRequestRepository();
    this.auditRepo = new AuditLogRepository();
  }

  /**
   * Approve a registration request
   * Creates user account and sends notification (mock email for MVP)
   */
  async approveRegistration(params: ApproveRegistrationParams): Promise<{
    request: RegistrationRequest;
    user: User;
  }> {
    // Check if request exists and is pending
    const request = await this.registrationRepo.findById(params.registrationRequestId);
    if (!request) {
      throw new Error('Registration request not found');
    }
    if (request.status !== 'pending') {
      throw new Error(`Registration request already ${request.status}`);
    }

    // Generate temporary password (in production, this would be sent via email)
    const tempPassword = randomBytes(16).toString('hex');
    const password_hash = `$2b$10$${tempPassword}`; // Mock hash for MVP

    // Approve request and create user account (atomic transaction)
    const result = await this.registrationRepo.approve(
      params.registrationRequestId,
      params.processedBy,
      {
        name: request.applicant_name,
        email: request.email,
        password_hash,
        role: request.requested_role,
      }
    );

    // Create audit log entry
    await this.auditRepo.create({
      userId: params.processedBy,
      userName: params.processedByName,
      userRole: params.processedByRole,
      actionType: 'registration_approved',
      resource: 'registration_request',
      resourceId: params.registrationRequestId,
      outcome: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      hash: '', // Hash will be computed by audit service
    });

    // Mock email notification (in production, send actual email)
    console.log(`[MOCK EMAIL] Registration approved for ${result.user.email}`);
    console.log(`[MOCK EMAIL] Temporary password: ${tempPassword}`);

    return result;
  }

  /**
   * Reject a registration request
   * Stores rejection reason and sends notification (mock email for MVP)
   */
  async rejectRegistration(params: RejectRegistrationParams): Promise<RegistrationRequest> {
    // Check if request exists and is pending
    const request = await this.registrationRepo.findById(params.registrationRequestId);
    if (!request) {
      throw new Error('Registration request not found');
    }
    if (request.status !== 'pending') {
      throw new Error(`Registration request already ${request.status}`);
    }

    // Reject request
    const rejectedRequest = await this.registrationRepo.reject(
      params.registrationRequestId,
      params.processedBy,
      params.reason
    );

    if (!rejectedRequest) {
      throw new Error('Failed to reject registration request');
    }

    // Create audit log entry
    await this.auditRepo.create({
      userId: params.processedBy,
      userName: params.processedByName,
      userRole: params.processedByRole,
      actionType: 'registration_rejected',
      resource: 'registration_request',
      resourceId: params.registrationRequestId,
      outcome: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      hash: '', // Hash will be computed by audit service
    });

    // Mock email notification (in production, send actual email)
    console.log(`[MOCK EMAIL] Registration rejected for ${rejectedRequest.email}`);
    console.log(`[MOCK EMAIL] Reason: ${params.reason}`);

    return rejectedRequest;
  }

  /**
   * Change user role
   * Prevents self-demotion and invalidates all active sessions
   */
  async changeUserRole(params: ChangeRoleParams): Promise<User> {
    // Prevent administrators from changing their own role
    if (params.userId === params.adminId) {
      throw new Error('Cannot change your own role');
    }

    // Get current user
    const user = await this.userRepo.findById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    const previousRole = user.role;

    // Update user role
    const updatedUser = await this.userRepo.update(params.userId, {
      role: params.newRole,
    });

    if (!updatedUser) {
      throw new Error('Failed to update user role');
    }

    // Invalidate all active sessions for the user
    const invalidatedCount = await invalidateUserSessions(params.userId);

    // Create audit log entry
    await this.auditRepo.create({
      userId: params.adminId,
      userName: params.adminName,
      userRole: params.adminRole,
      actionType: 'role_changed',
      resource: 'user',
      resourceId: params.userId,
      outcome: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      hash: '', // Hash will be computed by audit service
    });

    console.log(`[INFO] Role changed for user ${params.userId}: ${previousRole} -> ${params.newRole}`);
    console.log(`[INFO] Invalidated ${invalidatedCount} active sessions`);

    return updatedUser;
  }

  /**
   * Deactivate user account
   * Prevents self-deactivation and terminates all active sessions
   */
  async deactivateAccount(params: DeactivateAccountParams): Promise<User> {
    // Prevent administrators from deactivating their own account
    if (params.userId === params.adminId) {
      throw new Error('Cannot deactivate your own account');
    }

    // Get current user
    const user = await this.userRepo.findById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.is_active) {
      throw new Error('User account is already deactivated');
    }

    // Deactivate account
    const updatedUser = await this.userRepo.update(params.userId, {
      is_active: false,
    });

    if (!updatedUser) {
      throw new Error('Failed to deactivate user account');
    }

    // Terminate all active sessions
    const invalidatedCount = await invalidateUserSessions(params.userId);

    // Create audit log entry
    await this.auditRepo.create({
      userId: params.adminId,
      userName: params.adminName,
      userRole: params.adminRole,
      actionType: 'account_deactivated',
      resource: 'user',
      resourceId: params.userId,
      outcome: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      hash: '', // Hash will be computed by audit service
    });

    console.log(`[INFO] Account deactivated for user ${params.userId}`);
    console.log(`[INFO] Reason: ${params.reason}`);
    console.log(`[INFO] Terminated ${invalidatedCount} active sessions`);

    return updatedUser;
  }

  /**
   * Activate user account
   * Restores authentication capabilities
   */
  async activateAccount(params: ActivateAccountParams): Promise<User> {
    // Get current user
    const user = await this.userRepo.findById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.is_active) {
      throw new Error('User account is already active');
    }

    // Activate account
    const updatedUser = await this.userRepo.update(params.userId, {
      is_active: true,
    });

    if (!updatedUser) {
      throw new Error('Failed to activate user account');
    }

    // Create audit log entry
    await this.auditRepo.create({
      userId: params.adminId,
      userName: params.adminName,
      userRole: params.adminRole,
      actionType: 'account_activated',
      resource: 'user',
      resourceId: params.userId,
      outcome: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      hash: '', // Hash will be computed by audit service
    });

    console.log(`[INFO] Account activated for user ${params.userId}`);
    if (params.reason) {
      console.log(`[INFO] Reason: ${params.reason}`);
    }

    return updatedUser;
  }

  /**
   * Enable MFA for user
   * Generates TOTP secret and sends email notification
   */
  async enableMFA(params: EnableMFAParams): Promise<{ user: User; secret: string; qrCode: string }> {
    const speakeasy = require('speakeasy');
    const QRCode = require('qrcode');
    const { EmailService } = require('./EmailService');

    const user = await this.userRepo.findById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (user.mfa_enabled) {
      throw new Error('MFA is already enabled for this user');
    }

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `Clinical AI (${user.email})`,
      length: 32,
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Update user with MFA settings
    const updatedUser = await this.userRepo.update(params.userId, {
      mfa_enabled: true,
      mfa_method: 'totp',
      mfa_secret: secret.base32,
    });

    if (!updatedUser) {
      throw new Error('Failed to enable MFA');
    }

    // Send email notification
    const emailService = new EmailService();
    await emailService.sendMFAEnabledEmail(user.email, user.name);

    // Create audit log entry
    await this.auditRepo.create({
      userId: params.adminId,
      userName: params.adminName,
      userRole: params.adminRole,
      actionType: 'mfa_enabled',
      resource: 'user',
      resourceId: params.userId,
      outcome: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      hash: '',
    });

    console.log(`[INFO] MFA enabled for user ${params.userId}`);

    return { user: updatedUser, secret: secret.base32, qrCode };
  }

  /**
   * Disable MFA for user
   * Removes MFA settings and sends email notification
   */
  async disableMFA(params: DisableMFAParams): Promise<User> {
    const { EmailService } = require('./EmailService');

    const user = await this.userRepo.findById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.mfa_enabled) {
      throw new Error('MFA is not enabled for this user');
    }

    // Remove MFA settings
    const updatedUser = await this.userRepo.update(params.userId, {
      mfa_enabled: false,
      mfa_method: undefined,
      mfa_secret: undefined,
    });

    if (!updatedUser) {
      throw new Error('Failed to disable MFA');
    }

    // Send email notification
    const emailService = new EmailService();
    await emailService.sendMFADisabledEmail(user.email, user.name);

    // Create audit log entry
    await this.auditRepo.create({
      userId: params.adminId,
      userName: params.adminName,
      userRole: params.adminRole,
      actionType: 'mfa_disabled',
      resource: 'user',
      resourceId: params.userId,
      outcome: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      hash: '',
    });

    console.log(`[INFO] MFA disabled for user ${params.userId}`);

    return updatedUser;
  }

  /**
   * Require MFA re-enrollment
   * Invalidates current MFA and forces user to set up again
   */
  async requireMFAReenrollment(params: RequireMFAReenrollmentParams): Promise<User> {
    const { EmailService } = require('./EmailService');

    const user = await this.userRepo.findById(params.userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.mfa_enabled) {
      throw new Error('MFA is not enabled for this user');
    }

    // Invalidate current MFA
    const updatedUser = await this.userRepo.update(params.userId, {
      mfa_secret: undefined,
    });

    if (!updatedUser) {
      throw new Error('Failed to require MFA re-enrollment');
    }

    // Invalidate all active sessions
    await invalidateUserSessions(params.userId);

    // Send email notification
    const emailService = new EmailService();
    await emailService.sendMFAReenrollmentEmail(user.email, user.name);

    // Create audit log entry
    await this.auditRepo.create({
      userId: params.adminId,
      userName: params.adminName,
      userRole: params.adminRole,
      actionType: 'mfa_reenrollment_required',
      resource: 'user',
      resourceId: params.userId,
      outcome: 'success',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      requestId: params.requestId,
      hash: '',
    });

    console.log(`[INFO] MFA re-enrollment required for user ${params.userId}`);

    return updatedUser;
  }
}

export interface EnableMFAParams {
  userId: string;
  adminId: string;
  adminName: string;
  adminRole: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export interface DisableMFAParams {
  userId: string;
  adminId: string;
  adminName: string;
  adminRole: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}

export interface RequireMFAReenrollmentParams {
  userId: string;
  adminId: string;
  adminName: string;
  adminRole: string;
  ipAddress: string;
  userAgent: string;
  requestId: string;
}
