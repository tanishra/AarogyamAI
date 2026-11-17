import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import speakeasy from 'speakeasy';
import { encryptMfaSecret } from '../../lib/mfaCrypto';

import { getContainer } from '../../composition';
import { logger } from '../../lib/logger';

const router = Router();
const userManagementService = getContainer().services.userManagement;
const userRepo = getContainer().repositories.user;
const auditRepo = getContainer().repositories.auditLog;
const emailService = getContainer().services.email;

// Audit logging helper — writes hash-chained PostgreSQL record
const writeAuditLog = async (data: any) => {
  await auditRepo.create(data);
};

// Validation schemas
const changeRoleSchema = z.object({
  role: z.enum(['Patient', 'Nurse', 'Doctor', 'Administrator', 'DPO']),
});

const changeStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().optional(),
});

const passwordResetSchema = z.object({
  userId: z.string().uuid(),
});

const mfaSchema = z.object({
  enabled: z.boolean(),
  method: z.enum(['totp', 'sms']).optional(),
});

/**
 * PUT /api/admin/users/:id/role
 * Change user role
 */
router.put('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    // Validate request
    const validation = changeRoleSchema.safeParse({ role });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid role',
        details: validation.error.errors,
      });
      return;
    }

    // Change role
    const result = await userManagementService.changeUserRole({
      userId: id,
      newRole: role,
      adminId: req.user!.userId,
      adminName: req.user!.email,
      adminRole: req.user!.role,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
    });

    res.status(200).json({
      message: 'User role changed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error changing user role:', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Cannot change your own role')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change user role',
    });
  }
});

/**
 * PUT /api/admin/users/:id/status
 * Activate or deactivate user account
 */
router.put('/users/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;
    
    // Validate request
    const validation = changeStatusSchema.safeParse({ isActive, reason });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    // Activate or deactivate account
    let result;
    if (isActive) {
      result = await userManagementService.activateAccount({
        userId: id,
        adminId: req.user!.userId,
        adminName: req.user!.email,
        adminRole: req.user!.role,
        reason,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
      });
    } else {
      if (!reason) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Reason is required for deactivation',
        });
        return;
      }
      result = await userManagementService.deactivateAccount({
        userId: id,
        adminId: req.user!.userId,
        adminName: req.user!.email,
        adminRole: req.user!.role,
        reason,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
      });
    }

    res.status(200).json({
      message: `User account ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: result,
    });
  } catch (error) {
    logger.error('Error changing user status:', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Cannot deactivate your own account')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('already')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change user status',
    });
  }
});

/**
 * POST /api/admin/users/:id/password-reset
 * Initiate password reset for user
 */
router.post('/users/:id/password-reset', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request
    const validation = passwordResetSchema.safeParse({ userId: id });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid user ID',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user exists and is active
    const user = await userRepo.findById(id);
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }

    if (!user.is_active) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot reset password for deactivated account',
      });
      return;
    }

    // Generate reset token (mock for MVP)
    const resetToken = randomBytes(32).toString('hex');
    
    // Create audit log entry
    await writeAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'password_reset_initiated',
      resource: 'user',
      resourceId: id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    await emailService.sendPasswordResetEmail(user.email, resetToken);

    res.status(200).json({
      message: 'Password reset initiated successfully',
      data: {
        userId: id,
        email: user.email,
        resetTokenSent: true,
      },
    });
  } catch (error) {
    logger.error('Error initiating password reset:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to initiate password reset',
    });
  }
});

/**
 * PUT /api/admin/users/:id/mfa
 * Manage MFA settings for user
 */
router.put('/users/:id/mfa', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { enabled, method } = req.body;
    
    // Validate request
    const validation = mfaSchema.safeParse({ enabled, method });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid MFA settings',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user exists
    const user = await userRepo.findById(id);
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }

    // Update MFA settings
    const updateData: any = { mfa_enabled: enabled };
    if (enabled && method) {
      updateData.mfa_method = method;
      const secret = speakeasy.generateSecret({ length: 20, name: `AarogyamAI (${id})` });
      updateData.mfa_secret = encryptMfaSecret(secret.base32);
    } else if (!enabled) {
      updateData.mfa_method = null;
      updateData.mfa_secret = null;
    }

    const updatedUser = await userRepo.update(id, updateData);

    // Create audit log entry
    await writeAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: enabled ? 'mfa_enabled' : 'mfa_disabled',
      resource: 'user',
      resourceId: id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    await emailService.sendMFAChangeNotification(user.email, user.name, enabled ? 'enabled' : 'disabled');

    res.status(200).json({
      message: `MFA ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: updatedUser,
    });
  } catch (error) {
    logger.error('Error managing MFA:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to manage MFA settings',
    });
  }
});

export default router;
