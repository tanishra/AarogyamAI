import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/authMiddleware';
import { chatRepository } from '../../repositories/ChatRepository';
import { llmService } from '../../services/LLMService';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';

const router = Router();

/**
 * POST /api/patient/chat/:sessionId/complete
 * Complete chat session and extract summary
 */
router.post('/:sessionId/complete', authenticate({}), async (req: Request, res: Response) => {
  
  try {
    const { sessionId } = req.params;

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

    if (session.status !== 'active') {
      res.status(400).json({
        error: 'Bad Request',
        message: `Chat session is not active (status: ${session.status})`,
      });
      return;
    }

    // Get conversation history
    const messages = await chatRepository.getMessages(sessionId);
    
    if (messages.length === 0) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Cannot complete session with no messages',
      });
      return;
    }
    
    const conversationHistory = messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content,
    }));

    // Extract structured summary
    let extractedData;
    try {
      extractedData = await llmService.extractPatientSummary(conversationHistory);
    } catch (aiError) {
      logger.error('[Complete Session] AI extraction failed:', { error: aiError });
      // Use fallback summary if AI fails
      extractedData = {
        chiefComplaint: messages.find(m => m.role === 'user')?.content.substring(0, 100) || 'See chat history',
        symptoms: [],
        duration: 'Not specified',
        severity: 'moderate',
        medicalHistory: [],
        currentMedications: [],
        allergies: [],
        socialHistory: {},
        reviewOfSystems: {},
      };
    }

    // Save summary
    try {
      await chatRepository.saveSummary({
        sessionId,
        patientId: session.patientId,
        chiefComplaint: extractedData.chiefComplaint || 'Not specified',
        symptoms: extractedData.symptoms || [],
        duration: extractedData.duration || 'Not specified',
        severity: extractedData.severity || 'moderate',
        medicalHistory: extractedData.medicalHistory || [],
        currentMedications: extractedData.currentMedications || [],
        allergies: extractedData.allergies || [],
        socialHistory: extractedData.socialHistory || {},
        reviewOfSystems: extractedData.reviewOfSystems || {},
      });
    } catch (saveError) {
      logger.error('[Complete Session] Failed to save summary:', { error: saveError });
      throw saveError;
    }

    // Update session status
    try {
      await chatRepository.updateSessionStatus(sessionId, 'completed');
    } catch (statusError) {
      logger.error('[Complete Session] Failed to update status:', { error: statusError });
      throw statusError;
    }

    // Add to patient queue
    try {
      await workflowRepository.addToQueue(session.patientId, sessionId);
    } catch (queueError) {
      logger.error('[Complete Session] Failed to add to queue:', { error: queueError });
      // Don't throw - queue is not critical
    }

    res.status(200).json({
      message: 'Chat session completed',
      data: {
        summary: extractedData,
        sessionId,
        status: 'completed',
      },
    });
  } catch (error) {
    logger.error('[Complete Session] failed', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to complete chat session',
    });
  }
});

export default router;
