import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { generateAccessToken, generateRefreshToken } from '../../auth/jwt';
import { createSession } from '../../auth/session';
import { randomBytes } from 'crypto';

import { logger } from '../../lib/logger';
import { userRepo, writeAuditLog, authRateLimit } from './shared';

const router = Router();

// Validation schemas
const passwordPolicy = z.string().min(12, 'Password must be at least 12 characters');

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: passwordPolicy,
  role: z.enum(['Patient', 'Nurse', 'Doctor']),
});

/**
 * POST /api/auth/signup
 * Register new user (Patient, Nurse, Doctor)
 */
router.post('/signup', authRateLimit, async (req: Request, res: Response) => {
  try {
    const validation = signupSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid signup data',
        details: validation.error.issues,
      });
      return;
    }

    const { name, email, password, role } = validation.data;

    // Check if user already exists
    const existingUser = await userRepo.findByEmail(email);
    if (existingUser) {
      res.status(409).json({
        error: 'Conflict',
        message: 'User with this email already exists',
      });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const user = await userRepo.create({
      name,
      email,
      password_hash: passwordHash,
      role,
      is_active: true,
    });

    // Create audit log
    await writeAuditLog({
      userId: user.id,
      userName: maskEmail(user.email),
      userRole: user.role,
      actionType: 'user_signup',
      resource: 'auth',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
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

    res.status(201).json({
      message: 'Signup successful',
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
    logger.error('Error during signup:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Signup failed',
    });
  }
});

export default router;
