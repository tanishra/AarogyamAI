import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';
import { chatRepository } from '../../repositories/ChatRepository';
import { canAccessPatientData } from './shared';

const router = Router();

const updateMedicalHistorySchema = z.object({
  medicalHistory: z.array(z.string()).optional(),
  currentMedications: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  familyHistory: z.array(z.string()).optional(),
  socialHistory: z.record(z.string(), z.any()).optional(),
});

/**
 * GET /api/patient/medical-history
 * Get latest structured medical history for authenticated patient
 */
router.get('/medical-history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this patient data',
      });
      return;
    }

    const rows = await workflowRepository.getSummariesByPatient(patientId);

    if (rows.length === 0) {
      res.status(200).json({
        message: 'No medical history found',
        data: {
          sessionId: null,
          medicalHistory: [],
          currentMedications: [],
          allergies: [],
          familyHistory: [],
          socialHistory: {},
          lastUpdated: null,
        },
      });
      return;
    }

    const latest = rows[0];

    res.status(200).json({
      message: 'Medical history retrieved',
      data: {
        sessionId: latest.session_id,
        medicalHistory: latest.medical_history || [],
        currentMedications: latest.current_medications || [],
        allergies: latest.allergies || [],
        familyHistory: [],
        socialHistory: latest.social_history || {},
        lastUpdated: latest.updated_at || latest.started_at || null,
      },
    });
  } catch (error) {
    logger.error('Error getting medical history:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve medical history',
    });
  }
});

/**
 * PUT /api/patient/medical-history
 * Update latest structured summary fields for patient
 */
router.put('/medical-history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to update this patient data',
      });
      return;
    }

    const validation = updateMedicalHistorySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid medical history payload',
        details: validation.error.issues,
      });
      return;
    }

    const existingSessionId = await workflowRepository.getSummarySessionId(patientId);

    if (!existingSessionId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'No intake summary exists yet. Complete one intake session first.',
      });
      return;
    }

    const sessionId = existingSessionId;
    const current = await chatRepository.getSummary(sessionId);

    if (!current) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Summary not found for latest session',
      });
      return;
    }

    const payload = validation.data;

    const updated = await chatRepository.saveSummary({
      sessionId: current.sessionId,
      patientId: current.patientId,
      chiefComplaint: current.chiefComplaint || '',
      symptoms: current.symptoms || [],
      duration: current.duration || '',
      severity: current.severity || '',
      medicalHistory: payload.medicalHistory ?? current.medicalHistory ?? [],
      currentMedications: payload.currentMedications ?? current.currentMedications ?? [],
      allergies: payload.allergies ?? current.allergies ?? [],
      socialHistory: payload.socialHistory ?? current.socialHistory ?? {},
      reviewOfSystems: current.reviewOfSystems ?? {},
    });

    res.status(200).json({
      message: 'Medical history updated',
      data: {
        sessionId: updated.sessionId,
        medicalHistory: updated.medicalHistory || [],
        currentMedications: updated.currentMedications || [],
        allergies: updated.allergies || [],
        familyHistory: payload.familyHistory || [],
        socialHistory: payload.socialHistory ?? updated.socialHistory ?? {},
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error updating medical history:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update medical history',
    });
  }
});

export default router;
