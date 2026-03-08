import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { chatRepository } from '../repositories/ChatRepository';
import { llmService } from '../services/LLMService';
import { query } from '../config/database';

const router = Router();

// Validation schemas
const startChatSchema = z.object({
  patientId: z.string().uuid(),
});

const sendMessageSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(2000),
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
        details: validation.error.errors,
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
      console.error('Failed to generate AI welcome message, using default:', aiError);
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
    console.error('Error starting chat session:', error);
    
    // Provide more specific error message
    const errorMessage = error instanceof Error ? error.message : 'Failed to start chat session';
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/patient/chat/message
 * Send message and get AI response
 */
router.post('/message', authenticate({}), async (req: Request, res: Response) => {
  try {
    console.log('[POST /message] Request body:', JSON.stringify(req.body, null, 2));
    
    const validation = sendMessageSchema.safeParse(req.body);
    if (!validation.success) {
      console.log('[POST /message] Validation failed:', validation.error.errors);
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
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
    console.error('Error sending message:', error);
    
    // Provide more specific error message
    const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
    
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
    console.error('Error getting chat history:', error);
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

    console.log('[GET Session] req.user.userId:', req.user!.userId);
    console.log('[GET Session] session.patient_id:', session.patientId);
    console.log('[GET Session] req.user.role:', req.user!.role);

    // Check permission - allow patient, admin, nurse, or doctor
    if (
      req.user!.userId !== session.patientId &&
      req.user!.role !== 'Administrator' &&
      req.user!.role !== 'Nurse' &&
      req.user!.role !== 'Doctor'
    ) {
      console.log('[GET Session] Permission denied');
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
      const reasoning = await query(
        `SELECT 
          id,
          session_id,
          differential_diagnosis,
          diagnostic_plan,
          reasoning_rationale,
          final_notes,
          status,
          approved_at
        FROM clinical_reasoning
        WHERE session_id = $1 AND status = 'approved'
        LIMIT 1`,
        [sessionId]
      );
      
      if (reasoning.length > 0) {
        const record = reasoning[0];
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
      console.error('[GET Session] Error fetching clinical reasoning:', err);
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
    console.error('Error getting chat history:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get chat history',
    });
  }
});

/**
 * POST /api/patient/chat/:sessionId/complete
 * Complete chat session and extract summary
 */
router.post('/:sessionId/complete', authenticate({}), async (req: Request, res: Response) => {
  console.log('[Complete Session] ===== START =====');
  console.log('[Complete Session] Session ID:', req.params.sessionId);
  console.log('[Complete Session] User ID:', req.user?.userId);
  
  try {
    const { sessionId } = req.params;

    // Get session
    console.log('[Complete Session] Fetching session...');
    const session = await chatRepository.getSession(sessionId);
    if (!session) {
      console.log('[Complete Session] Session not found');
      res.status(404).json({
        error: 'Not Found',
        message: 'Chat session not found',
      });
      return;
    }
    console.log('[Complete Session] Session found:', session);

    console.log('[Complete Session] Session patient ID:', session.patientId);
    console.log('[Complete Session] Request user ID:', req.user!.userId);

    // Check permission
    if (req.user!.userId !== session.patientId && req.user!.role !== 'Administrator') {
      console.log('[Complete Session] Permission denied');
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this chat session',
      });
      return;
    }

    if (session.status !== 'active') {
      console.log('[Complete Session] Session not active, status:', session.status);
      res.status(400).json({
        error: 'Bad Request',
        message: `Chat session is not active (status: ${session.status})`,
      });
      return;
    }

    // Get conversation history
    console.log('[Complete Session] Fetching messages...');
    const messages = await chatRepository.getMessages(sessionId);
    console.log(`[Complete Session] Found ${messages.length} messages`);
    
    if (messages.length === 0) {
      console.log('[Complete Session] No messages found');
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
    console.log('[Complete Session] Extracting patient summary with AI...');
    let extractedData;
    try {
      extractedData = await llmService.extractPatientSummary(conversationHistory);
      console.log('[Complete Session] AI extraction successful');
      console.log('[Complete Session] Extracted data:', JSON.stringify(extractedData, null, 2));
    } catch (aiError) {
      console.error('[Complete Session] AI extraction failed:', aiError);
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
      console.log('[Complete Session] Using fallback summary');
    }

    // Save summary
    console.log('[Complete Session] Saving summary to database...');
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
      console.log('[Complete Session] Summary saved successfully');
    } catch (saveError) {
      console.error('[Complete Session] Failed to save summary:', saveError);
      throw saveError;
    }

    // Update session status
    console.log('[Complete Session] Updating session status to completed...');
    try {
      await chatRepository.updateSessionStatus(sessionId, 'completed');
      console.log('[Complete Session] Session status updated');
    } catch (statusError) {
      console.error('[Complete Session] Failed to update status:', statusError);
      throw statusError;
    }

    // Add to patient queue
    console.log('[Complete Session] Adding patient to queue...');
    try {
      await query(
        `INSERT INTO patient_queue (patient_id, session_id, status, priority)
         VALUES ($1, $2, 'chat_completed', 'routine')
         ON CONFLICT (patient_id, session_id) DO NOTHING`,
        [session.patientId, sessionId]
      );
      console.log('[Complete Session] Patient added to queue');
    } catch (queueError) {
      console.error('[Complete Session] Failed to add to queue:', queueError);
      // Don't throw - queue is not critical
    }

    console.log('[Complete Session] ===== SUCCESS =====');
    res.status(200).json({
      message: 'Chat session completed',
      data: {
        summary: extractedData,
        sessionId,
        status: 'completed',
      },
    });
  } catch (error) {
    console.error('[Complete Session] ===== ERROR =====');
    console.error('[Complete Session] Error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Failed to complete chat session',
    });
  }
});

export default router;
