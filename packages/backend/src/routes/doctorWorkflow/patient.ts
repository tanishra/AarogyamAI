import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { chatRepository } from '../../repositories/ChatRepository';
import { vitalsRepository } from '../../repositories/VitalsRepository';
import { clinicalRepository } from '../../repositories/ClinicalRepository';
import { logger } from '../../lib/logger';

const router = Router();

/**
 * GET /api/doctor/patient/:patientId/context
 * Get unified patient context (chat + vitals + summary)
 */
router.get('/patient/:patientId/context', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const { sessionId } = req.query;

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can access this endpoint',
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

    // Get patient info
    const patientInfo = await workflowRepository.findUserBasic(patientId);

    if (!patientInfo) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Patient not found',
      });
      return;
    }

    // Get chat session
    const session = await chatRepository.getSession(sessionId as string);
    
    if (!session || session.patientId !== patientId) {
      logger.debug('[Doctor Context] Session not found or patient mismatch');
      logger.debug('[Doctor Context] Session:', { value: session });
      logger.debug('[Doctor Context] Expected patientId:', { value: patientId });
      logger.debug('[Doctor Context] Session patientId:', { value: session?.patientId });
      res.status(404).json({
        error: 'Not Found',
        message: 'Chat session not found',
      });
      return;
    }

    // Get patient summary
    const summary = await chatRepository.getSummary(sessionId as string);

    // Get vitals
    const vitals = await vitalsRepository.getBySession(sessionId as string);

    // Get existing considerations
    const considerations = await clinicalRepository.getConsiderationsBySession(sessionId as string);

    // Get existing reasoning
    const reasoning = await clinicalRepository.getReasoningBySession(sessionId as string);

    // Update queue status to under_review
    await workflowRepository.updateQueueStatus(patientId, sessionId as string, 'under_review', req.user!.userId);

    res.status(200).json({
      message: 'Patient context retrieved',
      data: {
        patient: patientInfo,
        session,
        summary,
        vitals,
        considerations,
        reasoning,
      },
    });
  } catch (error) {
    logger.error('Error getting patient context:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get patient context',
    });
  }
});

/**
 * GET /api/doctor/patient/:patientId/history
 * Get patient's clinical history with completed encounters
 */
router.get('/patient/:patientId/history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can access patient history',
      });
      return;
    }

    // Get completed encounters with full details
    const completedEncounters = await workflowRepository.getCompletedEncounters(patientId);

    // Transform to camelCase and structure the data
    const encounters = completedEncounters.map((raw: any) => ({
      sessionId: raw.session_id,
      status: raw.status,
      startedAt: raw.started_at,
      completedAt: raw.completed_at,
      durationMinutes: raw.duration_minutes,
      emergencyDetected: raw.emergency_detected,
      priority: raw.priority,
      nurseName: raw.nurse_name,
      doctorName: raw.doctor_name,
      doctorEmail: raw.doctor_email,
      summary: raw.chief_complaint ? {
        chiefComplaint: raw.chief_complaint,
        symptoms: raw.symptoms,
        duration: raw.symptom_duration,
        severity: raw.severity,
        medicalHistory: raw.medical_history,
        currentMedications: raw.current_medications,
        allergies: raw.allergies,
      } : null,
      clinicalReasoning: raw.reasoning_id ? {
        id: raw.reasoning_id,
        differentialDiagnosis: raw.differential_diagnosis,
        diagnosticPlan: raw.diagnostic_plan,
        reasoningRationale: raw.reasoning_rationale,
        finalNotes: raw.final_notes,
        status: raw.reasoning_status,
        approvedAt: raw.approved_at,
      } : null,
    }));

    // Get vitals history
    const vitalsHistory = await vitalsRepository.getByPatient(patientId, 20);

    // Get all clinical reasoning (including drafts)
    const allReasoning = await workflowRepository.getReasoningHistoryByPatient(patientId);

    const reasoningHistory = allReasoning.map((raw: any) => ({
      id: raw.id,
      patientId: raw.patient_id,
      sessionId: raw.session_id,
      doctorId: raw.doctor_id,
      doctorName: raw.doctor_name,
      doctorEmail: raw.doctor_email,
      differentialDiagnosis: raw.differential_diagnosis,
      diagnosticPlan: raw.diagnostic_plan,
      reasoningRationale: raw.reasoning_rationale,
      finalNotes: raw.final_notes,
      status: raw.status,
      approvedAt: raw.approved_at,
      createdAt: raw.created_at,
      version: raw.version,
    }));

    res.status(200).json({
      message: 'Patient history retrieved',
      data: {
        completedEncounters: encounters,
        vitalsHistory,
        reasoningHistory,
        encounterCount: encounters.length,
      },
    });
  } catch (error) {
    logger.error('Error getting patient history:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get patient history',
    });
  }
});

export default router;
