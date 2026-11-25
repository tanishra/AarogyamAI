import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { chatRepository } from '../../repositories/ChatRepository';
import { llmService } from '../../services/LLMService';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';

const router = Router();

// Validation schemas
const startChatSchema = z.object({
  patientId: z.string().uuid(),
});

/**
 * POST /api/patient/chat/start
 * Start new chat session
 */
router.post('/start', authenticate({}), async (req: Request, res: Response) => {
  try {
    const validation = startChatSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.issues,
      });
      return;
    }

    const { patientId } = validation.data;

    // Check if user is the patient or has permission
    if (req.user!.userId !== patientId && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You can only start chat sessions for yourself',
      });
      return;
    }

    // Check for existing active session
    const existingSession = await chatRepository.getActiveSession(patientId);
    if (existingSession) {
      res.status(200).json({
        message: 'Active session found',
        data: {
          sessionId: existingSession.id,
          status: existingSession.status,
          startedAt: existingSession.startedAt,
          messageCount: existingSession.messageCount,
        },
      });
      return;
    }

    // Create new session
    const session = await chatRepository.createSession(patientId);

    // Add welcome message
    let welcomeMessage = 'Hello! I\'m your virtual nurse assistant. I\'m here to help gather information about your health concern before your consultation. How can I help you today?';
    
    try {
      welcomeMessage = await llmService.patientChat(
        [],
        'Hello, I need to speak with a nurse about my health concern.'
      );
    } catch (aiError) {
      logger.error('Failed to generate AI welcome message, using default:', { error: aiError });
      // Continue with default message
    }

    await chatRepository.addMessage(session.id, 'assistant', welcomeMessage);

    res.status(201).json({
      message: 'Chat session started',
      data: {
        sessionId: session.id,
        welcomeMessage,
      },
    });
  } catch (error) {
    logger.error('Error starting chat session:', { error: error });
    
    // Provide more specific error message
    const errorMessage = error instanceof Error ? error.message : 'Failed to start chat session';
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/patient/chat/history
 * Get patient's chat history
 */
router.get('/history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;
    const sessions = await chatRepository.getPatientSessions(patientId);

    res.status(200).json({
      message: 'Chat history retrieved',
      data: {
        sessions,
      },
    });
  } catch (error) {
    logger.error('Error getting chat history:', { error: error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get chat history',
    });
  }
});

/**
 * GET /api/patient/chat/:sessionId
 * Get chat history
 */
router.get('/:sessionId', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = await chatRepository.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Chat session not found',
      });
      return;
    }


    // Check permission - allow patient, admin, nurse, or doctor
    if (
      req.user!.userId !== session.patientId &&
      req.user!.role !== 'Administrator' &&
      req.user!.role !== 'Nurse' &&
      req.user!.role !== 'Doctor'
    ) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this chat session',
      });
      return;
    }

    const messages = await chatRepository.getMessages(sessionId);
    
    // Get summary if session is completed
    let summary = null;
    if (session.status === 'completed') {
      summary = await chatRepository.getSummary(sessionId);
    }

    // Get clinical reasoning if available
    let clinicalReasoning = null;
    try {
      const record = await workflowRepository.getApprovedReasoningPlain(sessionId);

      if (record) {
        clinicalReasoning = {
          id: record.id,
          sessionId: record.session_id,
          differentialDiagnosis: record.differential_diagnosis,
          diagnosticPlan: record.diagnostic_plan,
          reasoningRationale: record.reasoning_rationale,
          finalNotes: record.final_notes,
          status: record.status,
          approvedAt: record.approved_at,
        };
      }
    } catch (err) {
      logger.error('[GET Session] Error fetching clinical reasoning:', { error: err });
      // Don't fail the request if clinical reasoning fetch fails
    }

    res.status(200).json({
      message: 'Chat history retrieved',
      data: {
        session,
        messages,
        summary,
        clinicalReasoning,
      },
    });
  } catch (error) {
    logger.error('Error getting chat history:', { error: error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get chat history',
    });
  }
});

export default router;
