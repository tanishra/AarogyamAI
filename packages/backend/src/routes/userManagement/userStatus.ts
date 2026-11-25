import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { logger } from '../../lib/logger';
import { userManagementService } from './shared';

const router = Router();

const changeStatusSchema = z.object({
  isActive: z.boolean(),
  reason: z.string().optional(),
});

/**
 * PUT /api/admin/users/:id/status
 * Activate or deactivate user account
 */
router.put('/users/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isActive, reason } = req.body;
    
    // Validate request
    const validation = changeStatusSchema.safeParse({ isActive, reason });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.issues,
      });
      return;
    }

    // Activate or deactivate account
    let result;
    if (isActive) {
      result = await userManagementService.activateAccount({
        userId: id,
        adminId: req.user!.userId,
        adminName: req.user!.email,
        adminRole: req.user!.role,
        reason,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
      });
    } else {
      if (!reason) {
        res.status(400).json({
          error: 'Bad Request',
          message: 'Reason is required for deactivation',
        });
        return;
      }
      result = await userManagementService.deactivateAccount({
        userId: id,
        adminId: req.user!.userId,
        adminName: req.user!.email,
        adminRole: req.user!.role,
        reason,
        ipAddress: req.ip || 'unknown',
        userAgent: req.headers['user-agent'] || 'unknown',
        requestId: randomBytes(16).toString('hex'),
      });
    }

    res.status(200).json({
      message: `User account ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: result,
    });
  } catch (error) {
    logger.error('Error changing user status:', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('Cannot deactivate your own account')) {
        res.status(403).json({
          error: 'Forbidden',
          message: error.message,
        });
        return;
      }
      if (error.message.includes('already')) {
        res.status(409).json({
          error: 'Conflict',
          message: error.message,
        });
        return;
      }
    }
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to change user status',
    });
  }
});

export default router;
