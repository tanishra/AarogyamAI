import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { invalidateSession, getUserSessions } from '../../auth/session';
import { authenticate } from '../../auth/authMiddleware';
import { randomBytes } from 'crypto';

import { logger } from '../../lib/logger';
import { writeAuditLog } from './shared';

const router = Router();

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
