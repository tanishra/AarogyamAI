import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { workflowRepository } from '../repositories/WorkflowRepository';
import { getContainer } from '../composition';
import { logger } from '../lib/logger';
import { chatRepository } from '../repositories/ChatRepository';
import { vitalsRepository } from '../repositories/VitalsRepository';

const router = Router();
const vitalsService = getContainer().services.vitals;
const alertingService = getContainer().services.criticalAlerting;

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

const acknowledgeAlertSchema = z.object({
  acknowledgedBy: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

/**
 * GET /api/nurse/queue
 * Get patients with completed chats waiting for vitals
 */
router.get('/queue', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access this endpoint',
      });
      return;
    }

    // Get patients in queue
    const patients = await workflowRepository.getNurseQueue();

    res.status(200).json({
      message: 'Nurse queue retrieved',
      data: {
        patients,
        count: patients.length,
      },
    });
  } catch (error) {
    logger.error('Error getting nurse queue:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get nurse queue',
    });
  }
});

/**
 * GET /api/nurse/patient/:patientId/summary
 * Get structured chat summary for patient
 */
router.get('/patient/:patientId/summary', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { sessionId } = req.query;

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access this endpoint',
      });
      return;
    }

    if (!sessionId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId query parameter is required',
      });
      return;
    }

    // Get chat session
    const session = await chatRepository.getSession(sessionId as string);
    
    if (!session || session.patientId !== patientId) {
      logger.debug('[Nurse Summary] Session not found or patient mismatch');
      logger.debug('[Nurse Summary] Session:', { value: session });
      logger.debug('[Nurse Summary] Expected patientId:', { value: patientId });
      logger.debug('[Nurse Summary] Session patientId:', { value: session?.patientId });
      res.status(404).json({
        error: 'Not Found',
        message: 'Chat session not found for this patient',
      });
      return;
    }

    // Get patient summary
    const summary = await chatRepository.getSummary(sessionId as string);
    if (!summary) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Patient summary not found',
      });
      return;
    }

    // Get patient info
    const patientInfo = await workflowRepository.findUserBasic(patientId);

    res.status(200).json({
      message: 'Patient summary retrieved',
      data: {
        patient: patientInfo,
        session,
        summary,
      },
    });
  } catch (error) {
    logger.error('Error getting patient summary:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get patient summary',
    });
  }
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
      logger.debug('[Add Vitals] Validation failed:', { value: validation.error.errors });
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid vitals data',
        details: validation.error.errors,
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
 * POST /api/nurse/patient/:patientId/ready
 * Mark patient ready for doctor review
 */
router.post('/patient/:patientId/ready', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { sessionId } = req.body;

    logger.debug('[Mark Ready] Request received:', { value: { patientId, sessionId, body: req.body } });

    if (!sessionId) {
      logger.debug('[Mark Ready] Missing sessionId in request body');
      res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId is required',
      });
      return;
    }

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      logger.debug('[Mark Ready] Forbidden - user role:', { value: req.user!.role });
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can mark patients ready',
      });
      return;
    }

    // Check if vitals have been added (optional for MVP - just log warning)
    const vitals = await vitalsRepository.getBySession(sessionId);
    if (!vitals) {
      logger.debug('[Mark Ready] Warning: No vitals found for session, but allowing anyway for MVP');
    } else {
      logger.debug('[Mark Ready] Vitals found for session');
    }

    // Update queue status and assign nurse
    logger.debug('[Mark Ready] Updating queue status to ready_for_doctor and assigning nurse');
    const updateResult = await workflowRepository.updateQueueStatusWithNurseReturning(
      patientId,
      sessionId,
      'ready_for_doctor',
      req.user!.userId
    );

    logger.debug('[Mark Ready] Update result:', { value: updateResult });

    if (updateResult.length === 0) {
      logger.debug('[Mark Ready] No queue entry found for patient/session');
      res.status(404).json({
        error: 'Not Found',
        message: 'Patient not found in queue',
      });
      return;
    }

    res.status(200).json({
      message: 'Patient marked ready for doctor review',
      data: updateResult[0],
    });
  } catch (error) {
    logger.error('[Mark Ready] Error marking patient ready:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to mark patient ready',
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

/**
 * GET /api/nurse/patient/:patientId/history
 * Get patient summary and recent chat sessions for nurse review
 */
router.get('/patient/:patientId/history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access patient history',
      });
      return;
    }

    const patient = await workflowRepository.findUserBasic(patientId);

    if (!patient) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Patient not found',
      });
      return;
    }

    const summary = await workflowRepository.getLatestSummary(patientId);

    const recentSessions = await chatRepository.getPatientSessions(patientId, 10);

    res.status(200).json({
      message: 'Patient history retrieved',
      data: {
        patient,
        summary,
        recentSessions,
      },
    });
  } catch (error) {
    logger.error('Error getting nurse patient history:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get patient history',
    });
  }
});

/**
 * GET /api/nurse/alerts/active
 * Get all active critical alerts
 */
router.get('/alerts/active', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access alerts',
      });
      return;
    }

    const alerts = await workflowRepository.getActiveAlerts();

    res.status(200).json({
      message: 'Active alerts retrieved',
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    logger.error('Error getting active alerts:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get active alerts',
    });
  }
});

/**
 * POST /api/nurse/alerts/:alertId/acknowledge
 * Acknowledge a critical alert
 */
router.post('/alerts/:alertId/acknowledge', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const validation = acknowledgeAlertSchema.safeParse({
      acknowledgedBy: req.user!.userId,
      notes: req.body.notes,
    });

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid acknowledgment data',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can acknowledge alerts',
      });
      return;
    }

    await alertingService.acknowledgeAlert(
      alertId,
      validation.data.acknowledgedBy
    );

    res.status(200).json({
      message: 'Alert acknowledged successfully',
    });
  } catch (error) {
    logger.error('Error acknowledging alert:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to acknowledge alert',
    });
  }
});

export default router;
