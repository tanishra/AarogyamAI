import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { workflowRepository } from '../repositories/WorkflowRepository';
import { getContainer } from '../composition';
import { logger } from '../lib/logger';
import { chatRepository } from '../repositories/ChatRepository';

const router = Router();
const consentRepo = getContainer().repositories.consent;
const questionnaireManager = getContainer().services.questionnaireSession;

const updateMedicalHistorySchema = z.object({
  medicalHistory: z.array(z.string()).optional(),
  currentMedications: z.array(z.string()).optional(),
  allergies: z.array(z.string()).optional(),
  familyHistory: z.array(z.string()).optional(),
  socialHistory: z.record(z.any()).optional(),
});

const updateConsentSchema = z.object({
  processingPurposes: z.array(z.string()).optional(),
  dataCategories: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});

const withdrawConsentSchema = z.object({
  consentId: z.string().uuid(),
});

const saveQuestionnaireProgressSchema = z.object({
  sessionId: z.string().uuid(),
  patientId: z.string().uuid(),
  currentStep: z.number().int().min(0),
  totalSteps: z.number().int().min(1),
  responses: z.record(z.any()),
  metadata: z.record(z.any()).optional(),
});

function canAccessPatientData(req: Request, patientId: string) {
  return req.user!.role === 'Administrator' || req.user!.userId === patientId;
}

/**
 * GET /api/patient/medical-history
 * Get latest structured medical history for authenticated patient
 */
router.get('/medical-history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this patient data',
      });
      return;
    }

    const rows = await workflowRepository.getSummariesByPatient(patientId);

    if (rows.length === 0) {
      res.status(200).json({
        message: 'No medical history found',
        data: {
          sessionId: null,
          medicalHistory: [],
          currentMedications: [],
          allergies: [],
          familyHistory: [],
          socialHistory: {},
          lastUpdated: null,
        },
      });
      return;
    }

    const latest = rows[0];

    res.status(200).json({
      message: 'Medical history retrieved',
      data: {
        sessionId: latest.session_id,
        medicalHistory: latest.medical_history || [],
        currentMedications: latest.current_medications || [],
        allergies: latest.allergies || [],
        familyHistory: [],
        socialHistory: latest.social_history || {},
        lastUpdated: latest.updated_at || latest.started_at || null,
      },
    });
  } catch (error) {
    logger.error('Error getting medical history:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve medical history',
    });
  }
});

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
      completedEncounters.map(async (encounter: any) => {
        const considerations = await workflowRepository.getConsiderationsForEncounter(
          encounter.session_id
        );

        return {
          ...encounter,
          considerations: considerations.map((c: any) => ({
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
    const encounters = encountersWithConsiderations.map((raw: any) => ({
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
  } catch (error) {
    logger.error('Error getting patient encounters:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve patient encounters',
    });
  }
});

/**
 * PUT /api/patient/medical-history
 * Update latest structured summary fields for patient
 */
router.put('/medical-history', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to update this patient data',
      });
      return;
    }

    const validation = updateMedicalHistorySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid medical history payload',
        details: validation.error.errors,
      });
      return;
    }

    const existingSessionId = await workflowRepository.getSummarySessionId(patientId);

    if (!existingSessionId) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'No intake summary exists yet. Complete one intake session first.',
      });
      return;
    }

    const sessionId = existingSessionId;
    const current = await chatRepository.getSummary(sessionId);

    if (!current) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Summary not found for latest session',
      });
      return;
    }

    const payload = validation.data;

    const updated = await chatRepository.saveSummary({
      sessionId: current.sessionId,
      patientId: current.patientId,
      chiefComplaint: current.chiefComplaint || '',
      symptoms: current.symptoms || [],
      duration: current.duration || '',
      severity: current.severity || '',
      medicalHistory: payload.medicalHistory ?? current.medicalHistory ?? [],
      currentMedications: payload.currentMedications ?? current.currentMedications ?? [],
      allergies: payload.allergies ?? current.allergies ?? [],
      socialHistory: payload.socialHistory ?? current.socialHistory ?? {},
      reviewOfSystems: current.reviewOfSystems ?? {},
    });

    res.status(200).json({
      message: 'Medical history updated',
      data: {
        sessionId: updated.sessionId,
        medicalHistory: updated.medicalHistory || [],
        currentMedications: updated.currentMedications || [],
        allergies: updated.allergies || [],
        familyHistory: payload.familyHistory || [],
        socialHistory: payload.socialHistory ?? updated.socialHistory ?? {},
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error updating medical history:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update medical history',
    });
  }
});

/**
 * GET /api/patient/consent
 * Get consent records for authenticated patient
 */
router.get('/consent', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;

    if (!canAccessPatientData(req, patientId)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to consent records',
      });
      return;
    }

    const records = await consentRepo.findByPatient(patientId);

    res.status(200).json({
      message: 'Consent records retrieved',
      data: records,
      count: records.length,
    });
  } catch (error) {
    logger.error('Error fetching patient consent records:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch consent records',
    });
  }
});

/**
 * POST /api/patient/consent/withdraw
 * Create withdrawal request for patient's consent record
 */
router.post('/consent/withdraw', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;
    const validation = withdrawConsentSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid withdrawal request',
        details: validation.error.errors,
      });
      return;
    }

    const consent = await consentRepo.findById(validation.data.consentId);

    if (!consent || consent.patient_id !== patientId) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Consent record not found',
      });
      return;
    }

    if (consent.status !== 'active') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Only active consent can be withdrawn',
      });
      return;
    }

    const withdrawal = await consentRepo.createWithdrawalRequest({
      consent_id: consent.id,
      patient_id: patientId,
    });

    res.status(201).json({
      message: 'Consent withdrawal request submitted',
      data: withdrawal,
    });
  } catch (error) {
    logger.error('Error creating consent withdrawal request:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to submit consent withdrawal request',
    });
  }
});

/**
 * PUT /api/patient/consent/:id
 * Update consent preferences for patient's consent record
 */
router.put('/consent/:id', authenticate({}), async (req: Request, res: Response) => {
  try {
    const patientId = req.user!.userId;
    const { id } = req.params;
    const validation = updateConsentSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid consent update payload',
        details: validation.error.errors,
      });
      return;
    }

    const consent = await consentRepo.findById(id);
    if (!consent || consent.patient_id !== patientId) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Consent record not found',
      });
      return;
    }

    const updated = await consentRepo.update(id, {
      processing_purposes: validation.data.processingPurposes,
      data_categories: validation.data.dataCategories,
      expires_at: validation.data.expiresAt ? new Date(validation.data.expiresAt) : undefined,
    });

    res.status(200).json({
      message: 'Consent updated',
      data: updated,
    });
  } catch (error) {
    logger.error('Error updating consent record:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update consent record',
    });
  }
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
        details: validation.error.errors,
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
