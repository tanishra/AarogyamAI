import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { logger } from '../../lib/logger';
import { consentRepo, canAccessPatientData } from './shared';

const router = Router();

const updateConsentSchema = z.object({
  processingPurposes: z.array(z.string()).optional(),
  dataCategories: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const withdrawConsentSchema = z.object({
  consentId: z.string().uuid(),
});

/**
 * GET /api/patient/consent
 * Get consent records for authenticated patient
 */
router.get('/consent', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to consent records',
      });
      return;
    }

    const records = await consentRepo.findByPatient(patientId);

    res.status(200).json({
      message: 'Consent records retrieved',
      data: records,
      count: records.length,
    });
  } catch (error) {
    logger.error('Error fetching patient consent records:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch consent records',
    });
  }
});

/**
 * POST /api/patient/consent/withdraw
 * Create withdrawal request for patient's consent record
 */
router.post('/consent/withdraw', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;
    const validation = withdrawConsentSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid withdrawal request',
        details: validation.error.issues,
      });
      return;
    }

    const consent = await consentRepo.findById(validation.data.consentId);

    if (!consent || consent.patient_id !== patientId) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Consent record not found',
      });
      return;
    }

    if (consent.status !== 'active') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Only active consent can be withdrawn',
      });
      return;
    }

    const withdrawal = await consentRepo.createWithdrawalRequest({
      consent_id: consent.id,
      patient_id: patientId,
    });

    res.status(201).json({
      message: 'Consent withdrawal request submitted',
      data: withdrawal,
    });
  } catch (error) {
    logger.error('Error creating consent withdrawal request:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to submit consent withdrawal request',
    });
  }
});

/**
 * PUT /api/patient/consent/:id
 * Update consent preferences for patient's consent record
 */
router.put('/consent/:id', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;
    const { id } = req.params;
    const validation = updateConsentSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid consent update payload',
        details: validation.error.issues,
      });
      return;
    }

    const consent = await consentRepo.findById(id);
    if (!consent || consent.patient_id !== patientId) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Consent record not found',
      });
      return;
    }

    const updated = await consentRepo.update(id, {
      processing_purposes: validation.data.processingPurposes,
      data_categories: validation.data.dataCategories,
      expires_at: validation.data.expiresAt ? new Date(validation.data.expiresAt) : undefined,
    });

    res.status(200).json({
      message: 'Consent updated',
      data: updated,
    });
  } catch (error) {
    logger.error('Error updating consent record:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update consent record',
    });
  }
});

export default router;
