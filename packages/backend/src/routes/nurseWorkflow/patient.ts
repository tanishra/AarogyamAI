import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';
import { chatRepository } from '../../repositories/ChatRepository';

const router = Router();

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

export default router;
