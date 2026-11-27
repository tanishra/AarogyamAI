import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import speakeasy from 'speakeasy';
import { encryptMfaSecret } from '../../lib/mfaCrypto';

import { logger } from '../../lib/logger';
import { userRepo, emailService, writeAuditLog } from './shared';
import type { User } from '../../repositories/types';

const router = Router();

const mfaSchema = z.object({
  enabled: z.boolean(),
  method: z.enum(['totp', 'sms']).optional(),
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
        details: validation.error.issues,
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
    const updateData: Partial<User> = { mfa_enabled: enabled };
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
      userName: maskEmail(req.user!.email),
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
