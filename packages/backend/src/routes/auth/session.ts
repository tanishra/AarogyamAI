import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../../auth/jwt';
import { invalidateSession, getUserSessions } from '../../auth/session';
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

/**
 * GET /api/auth/sessions — list the caller's active sessions
 */
router.get('/sessions', authenticate({}), async (req: Request, res: Response) => {
  try {
    const sessions = await getUserSessions(req.user!.userId);
    res.status(200).json({
      data: sessions.map((s) => ({
        sessionId: s.sessionId,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        current: s.sessionId === req.sessionId,
      })),
      count: sessions.length,
    });
  } catch (error) {
    logger.error('Error listing sessions:', { error });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to list sessions' });
  }
});

/**
 * DELETE /api/auth/sessions/others — revoke every session except the caller's
 * current one. Requires the x-session-id header so "current" is unambiguous.
 */
router.delete('/sessions/others', authenticate({}), async (req: Request, res: Response) => {
  try {
    if (!req.sessionId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'x-session-id header required to identify the current session',
      });
      return;
    }

    const sessions = await getUserSessions(req.user!.userId);
    const others = sessions.filter((s) => s.sessionId !== req.sessionId);
    for (const s of others) {
      await invalidateSession(s.sessionId!);
    }

    await writeAuditLog({
      userId: req.user!.userId,
      userName: maskEmail(req.user!.email),
      userRole: req.user!.role,
      actionType: 'sessions_revoked_others',
      resource: 'auth',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    res.status(200).json({ message: 'Other sessions revoked', revoked: others.length });
  } catch (error) {
    logger.error('Error revoking other sessions:', { error });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to revoke sessions' });
  }
});

/**
 * DELETE /api/auth/sessions/:sessionId — revoke one of the caller's sessions.
 * Ownership enforced: a session belonging to another user cannot be revoked.
 */
router.delete('/sessions/:sessionId', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const sessions = await getUserSessions(req.user!.userId);
    const owned = sessions.find((s) => s.sessionId === sessionId);
    if (!owned) {
      res.status(404).json({ error: 'Not Found', message: 'Session not found' });
      return;
    }

    await invalidateSession(sessionId);

    await writeAuditLog({
      userId: req.user!.userId,
      userName: maskEmail(req.user!.email),
      userRole: req.user!.role,
      actionType: 'session_revoked',
      resource: 'auth',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    res.status(200).json({ message: 'Session revoked' });
  } catch (error) {
    logger.error('Error revoking session:', { error });
    res.status(500).json({ error: 'Internal Server Error', message: 'Failed to revoke session' });
  }
});

export default router;
