import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { getContainer } from '../../composition';
import { logger } from '../../lib/logger';

const router = Router();
const userManagementService = getContainer().services.userManagement;
const registrationRepo = getContainer().repositories.registrationRequest;

// Validation schemas
const approveRegistrationSchema = z.object({
  registrationRequestId: z.string().uuid(),
});

const rejectRegistrationSchema = z.object({
  registrationRequestId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

/**
 * POST /api/admin/registration-requests/:id/approve
 * Approve a registration request
 */
router.post('/registration-requests/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate request
    const validation = approveRegistrationSchema.safeParse({ registrationRequestId: id });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid registration request ID',
        details: validation.error.errors,
      });
      return;
    }

    // Approve registration
    const result = await userManagementService.approveRegistration({
      registrationRequestId: id,
      processedBy: req.user!.userId,
      processedByName: req.user!.email,
      processedByRole: req.user!.role,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
    });

    res.status(200).json({
      message: 'Registration request approved successfully',
      data: {
        request: result.request,
        user: result.user,
      },
    });
  } catch (error) {
    logger.error('Error approving registration:', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
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
      message: 'Failed to approve registration request',
    });
  }
});

/**
 * POST /api/admin/registration-requests/:id/reject
 * Reject a registration request
 */
router.post('/registration-requests/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    // Validate request
    const validation = rejectRegistrationSchema.safeParse({
      registrationRequestId: id,
      reason,
    });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    // Reject registration
    const result = await userManagementService.rejectRegistration({
      registrationRequestId: id,
      processedBy: req.user!.userId,
      processedByName: req.user!.email,
      processedByRole: req.user!.role,
      reason,
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
    });

    res.status(200).json({
      message: 'Registration request rejected successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error rejecting registration:', { error });
    
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        res.status(404).json({
          error: 'Not Found',
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
      message: 'Failed to reject registration request',
    });
  }
});

/**
 * GET /api/admin/registration-requests
 * Get all pending registration requests
 */
router.get('/registration-requests', async (_req: Request, res: Response) => {
  try {
    const requests = await registrationRepo.findPending();
    
    res.status(200).json({
      message: 'Registration requests retrieved successfully',
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    logger.error('Error fetching registration requests:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch registration requests',
    });
  }
});

export default router;
