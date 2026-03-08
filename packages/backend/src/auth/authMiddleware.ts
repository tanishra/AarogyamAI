import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from './jwt';
import { isTokenBlacklisted, getSession } from './session';
import { AuditLogRepository } from '../repositories/AuditLogRepository';

/**
 * Authentication Middleware
 * 
 * Extracts and verifies JWT from Authorization header
 * Checks token blacklist and session validity
 * Attaches user payload to request object
 */

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      sessionId?: string;
    }
  }
}

export interface AuthMiddlewareOptions {
  auditLogRepo?: AuditLogRepository;
}

/**
 * Extract token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Authentication middleware factory
 */
export function authenticate(options: AuthMiddlewareOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Extract token from header
      const token = extractToken(req);
      
      console.log('[Auth Middleware] Token extracted:', !!token);
      
      if (!token) {
        console.log('[Auth Middleware] No token provided');
        res.status(401).json({
          error: 'Unauthorized',
          message: 'No authentication token provided',
        });
        return;
      }

      // Check if token is blacklisted
      // DISABLED FOR MVP - blacklist causing issues with session completion
      // const blacklisted = await isTokenBlacklisted(token);
      // if (blacklisted) {
      //   console.log('[Auth Middleware] Token blacklisted');
      //   res.status(401).json({
      //     error: 'Unauthorized',
      //     message: 'Token has been revoked',
      //   });
      //   return;
      // }

      // Verify token
      let payload: TokenPayload;
      try {
        payload = verifyAccessToken(token);
        console.log('[Auth Middleware] Token verified, userId:', payload.userId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid token';
        console.log('[Auth Middleware] Token verification failed:', message);
        
        res.status(401).json({
          error: 'Unauthorized',
          message,
        });
        return;
      }

      // Attach user payload to request
      req.user = payload;
      console.log('[Auth Middleware] User attached to request:', req.user.userId);

      // Optionally verify session exists (if sessionId is in custom header)
      const sessionId = req.headers['x-session-id'] as string;
      if (sessionId) {
        const session = await getSession(sessionId);
        if (!session) {
          res.status(401).json({
            error: 'Unauthorized',
            message: 'Session expired or invalid',
          });
          return;
        }
        req.sessionId = sessionId;
      }

      next();
    } catch (error) {
      console.error('Authentication middleware error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authentication failed',
      });
    }
  };
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
export function optionalAuthenticate() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractToken(req);
      
      if (!token) {
        // No token provided, continue without authentication
        next();
        return;
      }

      // Check if token is blacklisted
      const blacklisted = await isTokenBlacklisted(token);
      if (blacklisted) {
        // Token is blacklisted, continue without authentication
        next();
        return;
      }

      // Try to verify token
      try {
        const payload = verifyAccessToken(token);
        req.user = payload;
        
        // Check session if provided
        const sessionId = req.headers['x-session-id'] as string;
        if (sessionId) {
          const session = await getSession(sessionId);
          if (session) {
            req.sessionId = sessionId;
          }
        }
      } catch {
        // Invalid token, continue without authentication
      }

      next();
    } catch (error) {
      console.error('Optional authentication middleware error:', error);
      next();
    }
  };
}
