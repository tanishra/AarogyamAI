import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';
import { canAccessPatientData } from './shared';

const router = Router();

/**
 * GET /api/patient/encounters
 * Get patient's completed encounters with clinical details
 */
router.get('/encounters', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this patient data',
      });
      return;
    }

    // Get completed encounters with full details
    logger.debug('[Patient Encounters] Fetching encounters', { patientId });
    const completedEncounters = await workflowRepository.getCompletedEncounters(patientId);
    logger.debug('[Patient Encounters] Found encounters', { count: completedEncounters.length });

    // For each encounter, get clinical considerations
    const encountersWithConsiderations = await Promise.all(
      completedEncounters.map(async (encounter) => {
        const considerations = await workflowRepository.getConsiderationsForEncounter(
          encounter.session_id
        );

        return {
          ...encounter,
          considerations: considerations.map((c) => ({
            conditionName: c.condition_name,
            likelihood: c.likelihood,
            urgency: c.urgency,
            explanation: c.explanation,
            doctorNotes: c.doctor_notes,
            status: c.status,
          })),
        };
      })
    );

    // Transform to camelCase and structure the data
    const encounters = encountersWithConsiderations.map((raw) => ({
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
      considerations: raw.considerations || [],
    }));

    logger.debug('[Patient Encounters] Returning encounters', { count: encounters.length });
    res.status(200).json({
      message: 'Encounters retrieved successfully',
      data: { encounters, count: encounters.length },
    });
  } catch (error) {
    logger.error('Error getting patient encounters:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve patient encounters',
    });
  }
});

export default router;
