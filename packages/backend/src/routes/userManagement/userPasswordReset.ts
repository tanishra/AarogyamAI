import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { logger } from '../../lib/logger';
import { userRepo, emailService, writeAuditLog } from './shared';

const router = Router();

const passwordResetSchema = z.object({
  userId: z.string().uuid(),
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
        details: validation.error.issues,
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
      userName: maskEmail(req.user!.email),
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

export default router;
