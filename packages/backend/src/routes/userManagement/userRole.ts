import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { logger } from '../../lib/logger';
import { userManagementService } from './shared';

const router = Router();

// Validation schemas
const changeRoleSchema = z.object({
  role: z.enum(['Patient', 'Nurse', 'Doctor', 'Administrator', 'DPO']),
});

/**
 * PUT /api/admin/users/:id/role
 * Change user role
 */
router.put('/users/:id/role', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    // Validate request
    const validation = changeRoleSchema.safeParse({ role });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid role',
        details: validation.error.issues,
      });
      return;
    }

    // Change role
    const result = await userManagementService.changeUserRole({
      userId: id,
      newRole: role,
      adminId: req.user!.userId,
      adminName: req.user!.email,
      adminRole: req.user!.role,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
    });

    res.status(200).json({
      message: 'User role changed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error changing user role:', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Cannot change your own role')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change user role',
    });
  }
});

export default router;
