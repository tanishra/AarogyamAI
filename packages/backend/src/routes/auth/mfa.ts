import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { generateAccessToken, generateRefreshToken } from '../../auth/jwt';
import { createSession } from '../../auth/session';
import { randomBytes } from 'crypto';
import speakeasy from 'speakeasy';
import { decryptMfaSecret } from '../../lib/mfaCrypto';

import { logger } from '../../lib/logger';
import { userRepo, writeAuditLog, authRateLimit } from './shared';

const router = Router();

// Validation schemas
const mfaVerifySchema = z.object({
  userId: z.string().uuid(),
  code: z.string().length(6),
});

/**
 * POST /api/admin/auth/mfa-verify
 * Verify MFA code and complete authentication
 */
router.post('/mfa-verify', authRateLimit, async (req: Request, res: Response) => {
  try {
    const validation = mfaVerifySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid MFA verification data',
        details: validation.error.issues,
      });
      return;
    }

    const { userId, code } = validation.data;

    // Get user
    const user = await userRepo.findById(userId);
    if (!user || !user.is_active) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid user',
      });
      return;
    }

    // Real TOTP verification against the user's stored secret
    if (!user.mfa_enabled || !user.mfa_secret) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'MFA is not enabled for this account',
      });
      return;
    }

    const isValidCode = speakeasy.totp.verify({
      secret: decryptMfaSecret(user.mfa_secret),
      encoding: 'base32',
      token: code,
      window: 1, // accept one 30s step either side for clock drift
    });
    
    if (!isValidCode) {
      // Create audit log for failed MFA
      await writeAuditLog({
        userId: user.id,
        userName: maskEmail(user.email),
        userRole: user.role,
        actionType: 'mfa_verification_failed',
        resource: 'auth',
        outcome: 'failure',
        errorDetails: 'Invalid MFA code',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
        hash: '',
      });

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid MFA code',
      });
      return;
    }

    // Update last MFA verification timestamp
    await userRepo.update(userId, {
      last_mfa_verification: new Date(),
    });

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Create session
    const sessionId = randomBytes(32).toString('hex');
    await createSession(sessionId, {
      userId: user.id,
      role: user.role,
      email: user.email,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
    });

    // Create audit log for successful MFA verification
    await writeAuditLog({
      userId: user.id,
      userName: maskEmail(user.email),
      userRole: user.role,
      actionType: 'mfa_verification_success',
      resource: 'auth',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    res.status(200).json({
      message: 'MFA verification successful',
      data: {
        accessToken,
        refreshToken,
        sessionId,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    logger.error('Error verifying MFA:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'MFA verification failed',
    });
  }
});

export default router;
