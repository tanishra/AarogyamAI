import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { getContainer } from '../../composition';
import { logger } from '../../lib/logger';
import { uuidParam } from '../../lib/uuidParam';
import { writeAuditLog } from './auditLog';

const router = Router();
const dataAccessRepo = getContainer().repositories.dataAccessRequest;
const userRepo = getContainer().repositories.user;
const emailService = getContainer().services.email;

// Validation schemas
const fulfillDataAccessRequestSchema = z.object({
  responseDocumentUrl: z.string().url(),
});

/**
 * GET /api/data-access-requests
 * Get all data access requests
 */
router.get('/data-access-requests', async (_req: Request, res: Response) => {
  try {
    const requests = await dataAccessRepo.findAll();

    res.status(200).json({
      message: 'Data access requests retrieved successfully',
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    logger.error('Error fetching data access requests:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch data access requests',
    });
  }
});

/**
 * PUT /api/data-access-requests/:id/fulfill
 * Fulfill a data access request
 */
router.put('/data-access-requests/:id/fulfill', async (req: Request, res: Response) => {
  try {
    const { id: rawId } = req.params;
    const id = uuidParam(rawId, res);
    if (!id) return;
    const { responseDocumentUrl } = req.body;

    // Validate request
    const validation = fulfillDataAccessRequestSchema.safeParse({ responseDocumentUrl });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.issues,
      });
      return;
    }

    // Fulfill the request
    const fulfilledRequest = await dataAccessRepo.fulfill(
      id,
      req.user!.userId,
      responseDocumentUrl
    );

    if (!fulfilledRequest) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Data access request not found or already fulfilled',
      });
      return;
    }

    // Create audit log entry
    await writeAuditLog({
      userId: req.user!.userId,
      userName: maskEmail(req.user!.email),
      userRole: req.user!.role,
      actionType: 'data_access_request_fulfilled',
      resource: 'data_access_request',
      resourceId: id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    // Best-effort notification — the request is already fulfilled
    try {
      const accessPatient = await userRepo.findById(fulfilledRequest.patient_id);
      if (accessPatient?.email) {
        await emailService.sendNotificationEmail(
          accessPatient.email,
          'Data Access Request Fulfilled',
          'Your data access request has been fulfilled.'
        );
      }
    } catch (error) {
      logger.error('Failed to send data access fulfillment notification:', { error });
    }

    res.status(200).json({
      message: 'Data access request fulfilled successfully',
      data: fulfilledRequest,
    });
  } catch (error) {
    logger.error('Error fulfilling data access request:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fulfill data access request',
    });
  }
});

export default router;
