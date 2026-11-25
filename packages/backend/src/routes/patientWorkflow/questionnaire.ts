import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { logger } from '../../lib/logger';
import { questionnaireManager, canAccessPatientData } from './shared';

const router = Router();

const saveQuestionnaireProgressSchema = z.object({
  sessionId: z.string().uuid(),
  patientId: z.string().uuid(),
  currentStep: z.number().int().min(0),
  totalSteps: z.number().int().min(1),
  responses: z.record(z.string(), z.any()),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * POST /api/patient/questionnaire/sessions/:sessionId/progress
 * Save questionnaire progress
 */
router.post('/questionnaire/sessions/:sessionId/progress', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const patientId = req.user!.userId;
    
    const validation = saveQuestionnaireProgressSchema.safeParse({
      ...req.body,
      sessionId,
      patientId,
    });

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid questionnaire progress data',
        details: validation.error.issues,
      });
      return;
    }

    if (!canAccessPatientData(req, validation.data.patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to save this questionnaire',
      });
      return;
    }

    const { patientId: progressPatientId, currentStep, responses } = validation.data;
    await questionnaireManager.saveSession({
      patientId: progressPatientId,
      sessionData: {
        patientId: progressPatientId,
        currentQuestionIndex: currentStep,
        answers: responses,
        skippedQuestions: [],
        uncertainAnswers: [],
        startedAt: new Date(),
        lastActivity: new Date(),
      },
    });

    res.status(200).json({
      message: 'Questionnaire progress saved',
    });
  } catch (error) {
    logger.error('Error saving questionnaire progress:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to save questionnaire progress',
    });
  }
});

/**
 * GET /api/patient/questionnaire/sessions/:sessionId/resume
 * Resume a questionnaire session
 */
router.get('/questionnaire/sessions/:sessionId/resume', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this questionnaire',
      });
      return;
    }

    const session = await questionnaireManager.loadSession(patientId);

    if (!session) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Questionnaire session not found or expired',
      });
      return;
    }

    res.status(200).json({
      message: 'Questionnaire session retrieved',
      data: session,
    });
  } catch (error) {
    logger.error('Error resuming questionnaire session:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to resume questionnaire session',
    });
  }
});

/**
 * GET /api/patient/questionnaire/sessions/:sessionId/can-resume
 * Check if a questionnaire session can be resumed
 */
router.get('/questionnaire/sessions/:sessionId/can-resume', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this questionnaire',
      });
      return;
    }

    const canResume = await questionnaireManager.canResumeSession(patientId);

    res.status(200).json({
      message: 'Resume status checked',
      data: {
        canResume,
      },
    });
  } catch (error) {
    logger.error('Error checking resume status:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to check resume status',
    });
  }
});

export default router;
