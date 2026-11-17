import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { getContainer } from '../../composition';
import { logger } from '../../lib/logger';
import { uuidParam } from '../../lib/uuidParam';
import { writeAuditLog } from './auditLog';

const router = Router();
const consentRepo = getContainer().repositories.consent;
const userRepo = getContainer().repositories.user;
const emailService = getContainer().services.email;

// Validation schemas
const consentRecordsSchema = z.object({
  patientId: z.string().uuid().optional(),
  status: z.enum(['active', 'withdrawn', 'expired']).optional(),
  consentType: z.string().optional(),
});

/**
 * GET /consent/records
 * Get consent records with optional filters
 */
router.get('/consent/records', async (req: Request, res: Response) => {
  try {
    const validation = consentRecordsSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { patientId, status, consentType } = validation.data;

    // Build filters
    const filters: any = {};
    if (patientId) filters.patient_id = patientId;
    if (status) filters.status = status;
    if (consentType) filters.consent_type = consentType;

    // Fetch consent records
    const records = await consentRepo.findAll(filters);

    res.status(200).json({
      message: 'Consent records retrieved successfully',
      data: records,
      count: records.length,
    });
  } catch (error) {
    logger.error('Error fetching consent records:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch consent records',
    });
  }
});

/**
 * GET /consent/withdrawal-requests
 * Get pending consent withdrawal requests
 */
router.get('/consent/withdrawal-requests', async (_req: Request, res: Response) => {
  try {
    const requests = await consentRepo.getPendingWithdrawals();

    res.status(200).json({
      message: 'Consent withdrawal requests retrieved successfully',
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    logger.error('Error fetching withdrawal requests:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch consent withdrawal requests',
    });
  }
});

/**
 * POST /consent/withdrawal-requests/:id/process
 * Process a consent withdrawal request
 */
router.post('/consent/withdrawal-requests/:id/process', async (req: Request, res: Response) => {
  try {
    const { id: rawId } = req.params;
    const id = uuidParam(rawId, res);
    if (!id) return;

    // Process the withdrawal request
    const withdrawalRequest = await consentRepo.processWithdrawalRequest(
      id,
      req.user!.userId
    );

    if (!withdrawalRequest) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Withdrawal request not found or already processed',
      });
      return;
    }

    // Withdraw the consent record
    const consentRecord = await consentRepo.withdraw(withdrawalRequest.consent_id);

    if (!consentRecord) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to withdraw consent record',
      });
      return;
    }

    // Create audit log entry
    await writeAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'consent_withdrawal_processed',
      resource: 'consent_record',
      resourceId: withdrawalRequest.consent_id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    // Best-effort notification — the withdrawal is already committed
    try {
      const withdrawalPatient = await userRepo.findById(withdrawalRequest.patient_id);
      if (withdrawalPatient?.email) {
        await emailService.sendNotificationEmail(
          withdrawalPatient.email,
          'Consent Withdrawal Confirmed',
          'Your consent withdrawal request has been processed.'
        );
      }
    } catch (error) {
      logger.error('Failed to send consent withdrawal notification:', { error });
    }

    res.status(200).json({
      message: 'Consent withdrawal processed successfully',
      data: {
        withdrawalRequest,
        consentRecord,
      },
    });
  } catch (error) {
    logger.error('Error processing withdrawal request:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process consent withdrawal request',
    });
  }
});

export default router;
