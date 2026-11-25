import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';
import { vitalsRepository } from '../../repositories/VitalsRepository';

const router = Router();

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

export default router;
