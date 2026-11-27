import { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import { z } from 'zod';
import { getRedisClient } from '../config/redis';
import { rateLimitRejections } from '../lib/metrics';

/**
 * Security headers middleware using Helmet
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  xssFilter: true,
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },
});

/**
 * Input sanitization middleware
 * Removes potentially dangerous characters from string inputs
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  const sanitizeString = (str: string): string => {
    // Remove HTML tags
    let sanitized = str.replace(/<[^>]*>/g, '');
    
    // Remove script tags and their content
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    
    // Remove potentially dangerous characters
    sanitized = sanitized.replace(/[<>]/g, '');
    
    return sanitized.trim();
  };

  const sanitizeObject = (obj: unknown): unknown => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    if (obj && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          sanitized[key] = sanitizeObject((obj as Record<string, unknown>)[key]);
        }
      }
      return sanitized;
    }

    return obj;
  };

  // Sanitize request body
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }

  // Sanitize query parameters
  if (req.query) {
    req.query = sanitizeObject(req.query) as typeof req.query;
  }

  // Sanitize URL parameters
  if (req.params) {
    req.params = sanitizeObject(req.params) as typeof req.params;
  }

  next();
}

/**
 * Rate limiting middleware — Redis-backed fixed window (shared across
 * instances). Falls back to a local in-memory window if Redis is
 * unreachable so a Redis outage cannot disable limiting entirely.
 */
const requestCounts = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(options: {
  windowMs: number;
  maxRequests: number;
  bucket?: string;
}) {
  const bucket = options.bucket || `w${options.windowMs}m${options.maxRequests}`;

  const memoryFallback = (identifier: string): { count: number; resetTime: number } => {
    const now = Date.now();
    const key = `${bucket}:${identifier}`;
    let record = requestCounts.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 0, resetTime: now + options.windowMs };
      requestCounts.set(key, record);
    }
    record.count++;
    return record;
  };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const identifier = req.ip || 'unknown';

    let count: number;
    let retryAfter: number;
    try {
      const client = getRedisClient();
      const key = `rl:${bucket}:${identifier}`;
      count = await client.incr(key);
      if (count === 1) {
        await client.pexpire(key, options.windowMs);
      }
      const ttlMs = await client.pttl(key);
      retryAfter = Math.ceil((ttlMs > 0 ? ttlMs : options.windowMs) / 1000);
    } catch {
      const record = memoryFallback(identifier);
      count = record.count;
      retryAfter = Math.ceil((record.resetTime - Date.now()) / 1000);
    }

    if (count > options.maxRequests) {
      rateLimitRejections.inc({ bucket });
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter,
      });
      return;
    }

    next();
  };
}

/**
 * CSRF protection middleware
 * Validates CSRF token for state-changing operations
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }

  const csrfToken = req.headers['x-csrf-token'] as string;
  const sessionToken = req.headers['x-session-id'] as string;

  if (!csrfToken || !sessionToken) {
    res.status(403).json({
      error: 'Forbidden',
      message: 'CSRF token required',
    });
    return;
  }

  // In production, validate token against session
  // For now, just check presence
  next();
}

/**
 * SQL injection prevention helper
 * Use with parameterized queries
 */
export function validateUUID(value: string): boolean {
  const uuidSchema = z.string().uuid();
  return uuidSchema.safeParse(value).success;
}

/**
 * XSS prevention helper
 * Escape HTML entities
 */
export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Clean up old rate limit records periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of requestCounts.entries()) {
    if (now > record.resetTime) {
      requestCounts.delete(key);
    }
  }
}, 60000); // Clean up every minute
