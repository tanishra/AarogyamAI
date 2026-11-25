import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';
import { chatRepository } from '../../repositories/ChatRepository';
import { vitalsRepository } from '../../repositories/VitalsRepository';
import { vitalsService, alertingService } from './shared';

const router = Router();

// Validation schemas
const addVitalsSchema = z.object({
  patientId: z.string().uuid(),
  sessionId: z.string().uuid(),
  bloodPressureSystolic: z.number().min(50).max(250).optional(),
  bloodPressureDiastolic: z.number().min(30).max(150).optional(),
  heartRate: z.number().min(30).max(200).optional(),
  temperatureFahrenheit: z.number().min(95).max(106).optional(),
  oxygenSaturation: z.number().min(70).max(100).optional(),
  respiratoryRate: z.number().min(8).max(40).optional(),
  weightKg: z.number().min(1).max(300).optional(),
  heightCm: z.number().min(50).max(250).optional(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/nurse/patient/:patientId/vitals
 * Add vitals for patient
 */
router.post('/patient/:patientId/vitals', authenticate({}), async (req: Request, res: Response) => {
  try {
    logger.debug('[Add Vitals] ===== START =====');
    logger.debug('[Add Vitals] Patient ID:', { value: req.params.patientId });
    logger.debug('[Add Vitals] User:', { userId: req.user?.userId, role: req.user?.role });
    
    const { patientId } = req.params;
    const validation = addVitalsSchema.safeParse(req.body);

    if (!validation.success) {
      logger.debug('[Add Vitals] Validation failed:', { value: validation.error.issues });
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid vitals data',
        details: validation.error.issues,
      });
      return;
    }

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can add vitals',
      });
      return;
    }

    const vitalsData = validation.data;

    // Verify patient and session exist
    if (vitalsData.patientId !== patientId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Patient ID mismatch',
      });
      return;
    }

    const session = await chatRepository.getSession(vitalsData.sessionId);
    if (!session || session.patientId !== patientId) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Chat session not found',
      });
      return;
    }

    // Add vitals using VitalsService
    logger.debug('[Add Vitals] Submitting vitals to VitalsService...');
    const result = await vitalsService.submitVitals({
      patientId: vitalsData.patientId,
      encounterId: vitalsData.sessionId,
      recordedBy: req.user!.userId,
      vitals: {
        systolicBp: vitalsData.bloodPressureSystolic,
        diastolicBp: vitalsData.bloodPressureDiastolic,
        heartRate: vitalsData.heartRate,
        respiratoryRate: vitalsData.respiratoryRate,
        temperature: vitalsData.temperatureFahrenheit,
        temperatureUnit: 'F',
        oxygenSaturation: vitalsData.oxygenSaturation,
        height: vitalsData.heightCm,
        heightUnit: 'cm',
        weight: vitalsData.weightKg,
        weightUnit: 'kg',
      },
    });
    logger.debug('[Add Vitals] Vitals submitted successfully, ID:', { value: result.vitalSignId });

    // Check for critical alerts
    const alerts = await alertingService.checkVitals({
      vitalSignId: result.vitalSignId,
      patientId: vitalsData.patientId,
      encounterId: vitalsData.sessionId,
      systolicBp: vitalsData.bloodPressureSystolic,
      diastolicBp: vitalsData.bloodPressureDiastolic,
      heartRate: vitalsData.heartRate,
      respiratoryRate: vitalsData.respiratoryRate,
      temperature: vitalsData.temperatureFahrenheit,
      temperatureUnit: 'F',
      oxygenSaturation: vitalsData.oxygenSaturation,
    });

    // Update queue status
    await workflowRepository.updateQueueStatusWithNurse(
      patientId,
      vitalsData.sessionId,
      'vitals_added',
      req.user!.userId
    );

    res.status(201).json({
      message: 'Vitals added successfully',
      data: {
        vitalSignId: result.vitalSignId,
        alerts: alerts.length > 0 ? alerts : undefined,
        warnings: result.warnings,
      },
    });
  } catch (error) {
    logger.error('Error adding vitals:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add vitals',
    });
  }
});

/**
 * GET /api/nurse/patient/:patientId/vitals-history
 * Get recent vitals history for a patient
 */
router.get('/patient/:patientId/vitals-history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access vitals history',
      });
      return;
    }

    const vitalsHistory = await vitalsRepository.getByPatient(patientId, 20);

    res.status(200).json({
      message: 'Vitals history retrieved',
      data: vitalsHistory,
      count: vitalsHistory.length,
    });
  } catch (error) {
    logger.error('Error getting vitals history:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get vitals history',
    });
  }
});

export default router;
