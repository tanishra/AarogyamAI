import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { chatRepository } from '../../repositories/ChatRepository';
import { llmService } from '../../services/LLMService';
import { logger } from '../../lib/logger';

const router = Router();

const sendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

/**
 * POST /api/patient/chat/message
 * Send message and get AI response
 */
router.post('/message', authenticate({}), async (req: Request, res: Response) => {
  try {
    
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.issues,
      });
      return;
    }

    const { sessionId, message } = validation.data;

    // Get session
    const session = await chatRepository.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Chat session not found',
      });
      return;
    }

    // Check permission
    if (req.user!.userId !== session.patientId && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this chat session',
      });
      return;
    }

    // Check if session is active
    if (session.status !== 'active') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Chat session is not active',
      });
      return;
    }

    // Check time limit (20 minutes)
    const sessionDuration = (Date.now() - new Date(session.startedAt).getTime()) / 1000 / 60;
    if (sessionDuration > 20) {
      await chatRepository.updateSessionStatus(sessionId, 'completed');
      res.status(400).json({
        error: 'Bad Request',
        message: 'Chat session has exceeded time limit. Please complete the session.',
      });
      return;
    }

    // Save user message
    await chatRepository.addMessage(sessionId, 'user', message);

    // Get conversation history
    const messages = await chatRepository.getMessages(sessionId);
    const conversationHistory = messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    // Get AI response
    const aiResponse = await llmService.patientChat(conversationHistory, message);

    // Check for emergency detection
    const isEmergency = aiResponse.startsWith('EMERGENCY_DETECTED:');
    if (isEmergency) {
      await chatRepository.updateSessionStatus(sessionId, 'emergency', true);
    }

    // Save AI response
    await chatRepository.addMessage(sessionId, 'assistant', aiResponse);

    res.status(200).json({
      message: 'Message sent',
      data: {
        response: aiResponse,
        isEmergency,
        messageCount: session.messageCount + 2,
      },
    });
  } catch (error) {
    logger.error('Error sending message:', { error: error });
    
    // Provide more specific error message
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage,
    });
  }
});

export default router;
