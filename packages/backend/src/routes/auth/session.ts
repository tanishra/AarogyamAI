import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../auth/jwt';
import { invalidateSession } from '../../auth/session';
import { blacklistToken, isTokenBlacklisted } from '../../auth/session';
import { authenticate } from '../../auth/authMiddleware';
import { randomBytes } from 'crypto';

import { logger } from '../../lib/logger';
import { userRepo, writeAuditLog, authRateLimit } from './shared';

const router = Router();

// Validation schemas
const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/**
 * POST /api/admin/auth/logout
 * Invalidate session and blacklist token
 */
router.post('/logout', authenticate({}), async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    const sessionId = req.headers['x-session-id'] as string;

    // Blacklist the access token
    if (token) {
      await blacklistToken(token, 28800); // 8 hours
    }

    // Invalidate session
    if (sessionId) {
      await invalidateSession(sessionId);
    }

    // Create audit log for logout
    await writeAuditLog({
      userId: req.user!.userId,
      userName: maskEmail(req.user!.email),
      userRole: req.user!.role,
      actionType: 'logout',
      resource: 'auth',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    res.status(200).json({
      message: 'Logout successful',
    });
  } catch (error) {
    logger.error('Error during logout:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Logout failed',
    });
  }
});

/**
 * POST /api/admin/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', authRateLimit, async (req: Request, res: Response) => {
  try {
    const validation = refreshSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid refresh token format',
        details: validation.error.issues,
      });
      return;
    }

    const { refreshToken } = validation.data;

    // Reject already-rotated tokens
    try {
      if (await isTokenBlacklisted(refreshToken)) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Refresh token has already been used',
        });
        return;
      }
    } catch (error) {
      // Redis unavailable — fail closed
      logger.error('Blacklist check failed:', { error });
      res.status(503).json({
        error: 'Service Unavailable',
        message: 'Authentication service temporarily unavailable',
      });
      return;
    }

    // Verify refresh token
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
      });
      return;
    }

    // Check if user still exists and is active
    const user = await userRepo.findById(payload.userId);
    if (!user || !user.is_active) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'User account not found or deactivated',
      });
      return;
    }

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Optionally generate new refresh token (token rotation)
    const newRefreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Revoke the used refresh token — rotation without revocation leaves the
    // old token valid until natural expiry (replay window).
    try {
      const expSec = (payload as any).exp
        ? Math.max(0, (payload as any).exp - Math.floor(Date.now() / 1000))
        : 30 * 24 * 60 * 60;
      await blacklistToken(refreshToken, expSec);
    } catch (error) {
      // New tokens already generated; log and continue rather than 500 the refresh.
      logger.error('Failed to blacklist rotated refresh token:', { error });
    }

    res.status(200).json({
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    logger.error('Error refreshing token:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Token refresh failed',
    });
  }
});

export default router;
