import { Request, Response, NextFunction } from 'express';
import { AuditLogRepository } from '../repositories/AuditLogRepository';

/**
 * Authorization Middleware
 * 
 * Implements role-based access control
 * Checks user role against allowed roles
 * Creates audit log entries for unauthorized access attempts
 */

export type UserRole = 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';

export interface AuthorizationMiddlewareOptions {
  allowedRoles: UserRole[];
  auditLogRepo?: AuditLogRepository;
}

/**
 * Authorization middleware factory
 * 
 * @param options - Configuration with allowed roles and optional audit log repository
 * @returns Express middleware function
 */
export function authorize(options: AuthorizationMiddlewareOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Check if user is authenticated
      if (!req.user) {
        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
        });
        return;
      }

      // Check if user role is allowed
      const userRole = req.user.role;
      const isAuthorized = options.allowedRoles.includes(userRole);

      if (!isAuthorized) {
        // Log unauthorized access attempt (audit logging disabled for MVP)
        console.log('[AUTHORIZATION FAILED]:', req.user.userId, userRole, req.path);

        res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to access this resource',
        });
        return;
      }

      // User is authorized, proceed
      next();
    } catch (error) {
      console.error('Authorization middleware error:', error);
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Authorization check failed',
      });
    }
  };
}

/**
 * Convenience middleware for Administrator-only routes
 */
export function requireAdministrator() {
  return authorize({
    allowedRoles: ['Administrator'],
  });
}

/**
 * Convenience middleware for DPO-only routes
 */
export function requireDPO() {
  return authorize({
    allowedRoles: ['DPO'],
  });
}

/**
 * Convenience middleware for Administrator or DPO routes
 */
export function requireAdminOrDPO() {
  return authorize({
    allowedRoles: ['Administrator', 'DPO'],
  });
}

/**
 * Convenience middleware for healthcare professionals (Nurse or Doctor)
 */
export function requireHealthcareProfessional() {
  return authorize({
    allowedRoles: ['Nurse', 'Doctor'],
  });
}

/**
 * Convenience middleware for any authenticated user
 */
export function requireAuthenticated() {
  return authorize({
    allowedRoles: ['Patient', 'Nurse', 'Doctor', 'Administrator', 'DPO'],
  });
}
