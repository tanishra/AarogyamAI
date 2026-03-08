import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/UserRepository';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { createSession, invalidateSession } from '../auth/session';
import { blacklistToken } from '../auth/session';
import { authenticate } from '../auth/authMiddleware';
import { randomBytes } from 'crypto';

const router = Router();
const userRepo = new UserRepository();

// Mock audit logging for MVP (DynamoDB not configured)
const mockAuditLog = async (data: any) => {
  console.log('[AUDIT LOG - DISABLED FOR MVP]:', data.actionType, data.userId);
};

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const signupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['Patient', 'Nurse', 'Doctor']),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const mfaVerifySchema = z.object({
  userId: z.string().uuid(),
  code: z.string().length(6),
});

/**
 * POST /api/auth/signup
 * Register new user (Patient, Nurse, Doctor)
 */
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const validation = signupSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid signup data',
        details: validation.error.errors,
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
    await mockAuditLog({
      userId: user.id,
      userName: user.email,
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
    console.error('Error during signup:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Signup failed',
    });
  }
});

/**
 * POST /api/admin/auth/login
 * Authenticate user and create session
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid login credentials format',
        details: validation.error.errors,
      });
      return;
    }

    const { email, password } = validation.data;

    // Find user by email
    const user = await userRepo.findByEmail(email);
    
    if (!user) {
      // Create audit log for failed login
      await mockAuditLog({
        userId: 'anonymous',
        userName: email,
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

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

    // Check if account is active
    if (!user.is_active) {
      // Create audit log for deactivated account login attempt
      await mockAuditLog({
        userId: user.id,
        userName: user.email,
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
      await mockAuditLog({
        userId: user.id,
        userName: user.email,
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

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
      return;
    }

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
    await mockAuditLog({
      userId: user.id,
      userName: user.email,
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
    console.error('Error during login:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Login failed',
    });
  }
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
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
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
    console.error('Error during logout:', error);
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
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const validation = refreshSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid refresh token format',
        details: validation.error.errors,
      });
      return;
    }

    const { refreshToken } = validation.data;

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

    res.status(200).json({
      message: 'Token refreshed successfully',
      data: {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error('Error refreshing token:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Token refresh failed',
    });
  }
});

/**
 * POST /api/admin/auth/mfa-verify
 * Verify MFA code and complete authentication
 */
router.post('/mfa-verify', async (req: Request, res: Response) => {
  try {
    const validation = mfaVerifySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid MFA verification data',
        details: validation.error.errors,
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

    // Mock MFA verification (in production, verify TOTP or SMS code)
    const isValidCode = code === '123456'; // Mock verification
    
    if (!isValidCode) {
      // Create audit log for failed MFA
      await mockAuditLog({
        userId: user.id,
        userName: user.email,
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
    await mockAuditLog({
      userId: user.id,
      userName: user.email,
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
    console.error('Error verifying MFA:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'MFA verification failed',
    });
  }
});

export default router;

/**
 * POST /api/auth/password-reset/request
 * Request password reset email
 */
router.post('/password-reset/request', async (req: Request, res: Response) => {
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
    const { passwordResetService } = await import('../services/PasswordResetService');
    await passwordResetService.initiatePasswordReset(user.email, user.id);

    // Create audit log
    await mockAuditLog({
      userId: user.id,
      userName: user.email,
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
    console.error('Error requesting password reset:', error);
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
router.post('/password-reset/confirm', async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Token and new password are required',
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Password must be at least 8 characters',
      });
      return;
    }

    // Validate token
    const { passwordResetService } = await import('../services/PasswordResetService');
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
      await mockAuditLog({
        userId: user.id,
        userName: user.email,
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
    console.error('Error resetting password:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Password reset failed',
    });
  }
});
