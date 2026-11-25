import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { invalidateSession } from '../../auth/session';
import { blacklistToken } from '../../auth/session';
import { authenticate } from '../../auth/authMiddleware';
import { randomBytes } from 'crypto';

import { logger } from '../../lib/logger';
import { writeAuditLog } from './shared';

const router = Router();

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

export default router;
