import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';

const router = Router();

/**
 * GET /api/patient/session/:sessionId/clinical-reasoning
 * Get clinical reasoning (doctor's diagnosis) for a specific session
 */
router.get('/session/:sessionId/clinical-reasoning', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const patientId = req.user!.userId;

    logger.debug('[Clinical Reasoning] request', {
      sessionId,
      patientId,
      role: req.user!.role,
    });

    // Get approved clinical reasoning for this session
    const record = await workflowRepository.getApprovedReasoning(sessionId);

    if (!record) {
      res.status(200).json({
        message: 'No clinical reasoning found for this session',
        data: null,
      });
      return;
    }

    // Check if patient owns this session
    if (record.patient_id !== patientId && req.user!.role !== 'Administrator') {
      logger.warn('[Clinical Reasoning] access denied', { recordPatientId: record.patient_id, patientId });
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this session',
      });
      return;
    }

    res.status(200).json({
      message: 'Clinical reasoning retrieved',
      data: {
        id: record.id,
        sessionId: record.session_id,
        differentialDiagnosis: record.differential_diagnosis,
        diagnosticPlan: record.diagnostic_plan,
        reasoningRationale: record.reasoning_rationale,
        finalNotes: record.final_notes,
        status: record.status,
        approvedAt: record.approved_at,
      },
    });
  } catch (error) {
    logger.error('[Clinical Reasoning] Error:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve clinical reasoning',
    });
  }
});

export default router;
