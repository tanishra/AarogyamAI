import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { logger } from '../../lib/logger';
import { userRepo, writeAuditLog, authRateLimit } from './shared';

const router = Router();

/**
 * POST /api/auth/password-reset/request
 * Request password reset email
 */
router.post('/password-reset/request', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Email is required',
      });
      return;
    }

    // Find user
    const user = await userRepo.findByEmail(email);
    
    // Always return success to prevent email enumeration
    if (!user) {
      res.status(200).json({
        message: 'If an account exists with this email, a password reset link has been sent',
      });
      return;
    }

    // Check if account is active
    if (!user.is_active) {
      res.status(200).json({
        message: 'If an account exists with this email, a password reset link has been sent',
      });
      return;
    }

    // Generate reset token and send email
    const { passwordResetService } = await import('../../services/PasswordResetService');
    await passwordResetService.initiatePasswordReset(user.email, user.id);

    // Create audit log
    await writeAuditLog({
      userId: user.id,
      userName: maskEmail(user.email),
      userRole: user.role,
      actionType: 'password_reset_requested',
      resource: 'auth',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    res.status(200).json({
      message: 'If an account exists with this email, a password reset link has been sent',
    });
  } catch (error) {
    logger.error('Error requesting password reset:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Password reset request failed',
    });
  }
});

/**
 * POST /api/auth/password-reset/confirm
 * Reset password with token
 */
router.post('/password-reset/confirm', authRateLimit, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Token and new password are required',
      });
      return;
    }

    if (newPassword.length < 12) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Password must be at least 12 characters',
      });
      return;
    }

    // Validate token
    const { passwordResetService } = await import('../../services/PasswordResetService');
    const validation = passwordResetService.validateToken(token);

    if (!validation.valid || !validation.userId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid or expired reset token',
      });
      return;
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await userRepo.update(validation.userId, {
      password_hash: passwordHash,
      last_password_change: new Date(),
    });

    // Consume token
    passwordResetService.consumeToken(token);

    // Get user for audit log
    const user = await userRepo.findById(validation.userId);

    // Create audit log
    if (user) {
      await writeAuditLog({
        userId: user.id,
        userName: maskEmail(user.email),
        userRole: user.role,
        actionType: 'password_reset_completed',
        resource: 'auth',
        outcome: 'success',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
        hash: '',
      });
    }

    res.status(200).json({
      message: 'Password reset successful',
    });
  } catch (error) {
    logger.error('Error resetting password:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Password reset failed',
    });
  }
});

export default router;
