import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../../auth/jwt';
import { createSession } from '../../auth/session';
import { randomBytes } from 'crypto';
import { getLockSeconds, recordFailedAttempt, clearAttempts } from '../../lib/accountLockout';

import { logger } from '../../lib/logger';
import { userRepo, writeAuditLog, authRateLimit } from './shared';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * POST /api/admin/auth/login
 * Authenticate user and create session
 */
router.post('/login', authRateLimit, async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid login credentials format',
        details: validation.error.issues,
      });
      return;
    }

    const { email, password } = validation.data;

    const lockSeconds = await getLockSeconds(email);
    if (lockSeconds > 0) {
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Account temporarily locked due to failed login attempts',
        retryAfter: lockSeconds,
      });
      return;
    }

    // Find user by email
    const user = await userRepo.findByEmail(email);
    
    if (!user) {
      // Create audit log for failed login
      await writeAuditLog({
        userId: 'anonymous',
        userName: maskEmail(email),
        userRole: 'Unknown',
        actionType: 'login_failed',
        resource: 'auth',
        outcome: 'failure',
        errorDetails: 'User not found',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
        hash: '',
      });

      await recordFailedAttempt(email);

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    // Check if account is active
    if (!user.is_active) {
      // Create audit log for deactivated account login attempt
      await writeAuditLog({
        userId: user.id,
        userName: maskEmail(user.email),
        userRole: user.role,
        actionType: 'login_failed',
        resource: 'auth',
        outcome: 'failure',
        errorDetails: 'Account deactivated',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
        hash: '',
      });

      res.status(403).json({
        error: 'Forbidden',
        message: 'Account is deactivated',
      });
      return;
    }

    // Verify password
    const passwordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!passwordValid) {
      // Create audit log for failed login
      await writeAuditLog({
        userId: user.id,
        userName: maskEmail(user.email),
        userRole: user.role,
        actionType: 'login_failed',
        resource: 'auth',
        outcome: 'failure',
        errorDetails: 'Invalid password',
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
        hash: '',
      });

      await recordFailedAttempt(email);

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    await clearAttempts(email);

    // Check if MFA is enabled
    if (user.mfa_enabled) {
      // Return temporary token for MFA verification
      const mfaToken = randomBytes(32).toString('hex');
      
      res.status(200).json({
        message: 'MFA verification required',
        requiresMFA: true,
        mfaToken,
        userId: user.id,
      });
      return;
    }

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

    // Create audit log for successful login
    await writeAuditLog({
      userId: user.id,
      userName: maskEmail(user.email),
      userRole: user.role,
      actionType: 'login_success',
      resource: 'auth',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    res.status(200).json({
      message: 'Login successful',
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
    logger.error('Error during login:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed',
    });
  }
});

export default router;
