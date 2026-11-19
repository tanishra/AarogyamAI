import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { clinicalRepository } from '../../repositories/ClinicalRepository';
import { logger } from '../../lib/logger';

const router = Router();

// Validation schemas
const saveReasoningSchema = z.object({
  sessionId: z.string().uuid(),
  differentialDiagnosis: z.array(z.any()),
  diagnosticPlan: z.string().max(2000).optional(),
  reasoningRationale: z.string().max(2000).optional(),
  finalNotes: z.string().max(2000).optional(),
});

/**
 * POST /api/doctor/patient/:patientId/reasoning
 * Save clinical reasoning
 */
router.post('/patient/:patientId/reasoning', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const validation = saveReasoningSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.issues,
      });
      return;
    }

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can save clinical reasoning',
      });
      return;
    }

    const reasoningData = validation.data;

    // Check if reasoning already exists for this session
    const existingReasoning = await clinicalRepository.getReasoningBySession(reasoningData.sessionId);

    if (existingReasoning) {
      // Update existing reasoning
      await clinicalRepository.updateReasoning(existingReasoning.id, {
        differentialDiagnosis: reasoningData.differentialDiagnosis,
        diagnosticPlan: reasoningData.diagnosticPlan,
        reasoningRationale: reasoningData.reasoningRationale,
        finalNotes: reasoningData.finalNotes,
      });

      res.status(200).json({
        message: 'Clinical reasoning updated',
        data: {
          reasoningId: existingReasoning.id,
        },
      });
    } else {
      // Create new reasoning
      const reasoning = await clinicalRepository.createReasoning({
        patientId,
        sessionId: reasoningData.sessionId,
        doctorId: req.user!.userId,
        differentialDiagnosis: reasoningData.differentialDiagnosis,
        diagnosticPlan: reasoningData.diagnosticPlan,
        reasoningRationale: reasoningData.reasoningRationale,
        finalNotes: reasoningData.finalNotes,
      });

      res.status(201).json({
        message: 'Clinical reasoning saved',
        data: {
          reasoningId: reasoning.id,
        },
      });
    }
  } catch (error) {
    logger.error('Error saving clinical reasoning:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to save clinical reasoning',
    });
  }
});

/**
 * POST /api/doctor/reasoning/:reasoningId/approve
 * Approve clinical reasoning and complete patient review
 */
router.post('/reasoning/:reasoningId/approve', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { reasoningId } = req.params;

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can approve clinical reasoning',
      });
      return;
    }

    // Get reasoning
    const reasoning = await clinicalRepository.getReasoningById(reasoningId);
    if (!reasoning) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Clinical reasoning not found',
      });
      return;
    }

    // Verify doctor owns this reasoning
    if (reasoning.doctorId !== req.user!.userId && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You can only approve your own clinical reasoning',
      });
      return;
    }

    // Update reasoning status to approved
    await clinicalRepository.updateReasoning(reasoningId, {
      status: 'approved',
    });

    // Update patient queue status to completed
    if (reasoning.sessionId) {
      await workflowRepository.updateQueueStatusBySession(reasoning.sessionId, 'completed');
    }

    res.status(200).json({
      message: 'Clinical reasoning approved and patient review completed',
    });
  } catch (error) {
    logger.error('Error approving clinical reasoning:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to approve clinical reasoning',
    });
  }
});

export default router;
