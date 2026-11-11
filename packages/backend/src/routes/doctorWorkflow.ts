import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { workflowRepository } from '../repositories/WorkflowRepository';
import { getContainer } from '../composition';
import { logger } from '../lib/logger';
import { chatRepository } from '../repositories/ChatRepository';
import { vitalsRepository } from '../repositories/VitalsRepository';
import { clinicalRepository } from '../repositories/ClinicalRepository';
import { llmService } from '../services/LLMService';

const router = Router();
const differentialManager = getContainer().services.differentialManager;

// Validation schemas
const generateConsiderationsSchema = z.object({
  sessionId: z.string().uuid(),
});

const updateConsiderationSchema = z.object({
  considerationId: z.string().uuid(),
  status: z.enum(['accepted', 'modified', 'rejected']),
  doctorNotes: z.string().max(1000).optional(),
});

const saveReasoningSchema = z.object({
  sessionId: z.string().uuid(),
  differentialDiagnosis: z.array(z.any()),
  diagnosticPlan: z.string().max(2000).optional(),
  reasoningRationale: z.string().max(2000).optional(),
  finalNotes: z.string().max(2000).optional(),
});

const addDifferentialSchema = z.object({
  icdCode: z.string().min(1).max(20),
  diagnosisName: z.string().min(1).max(200),
  diagnosisCategory: z.string().max(100).optional(),
  priority: z.number().int().min(1),
  source: z.enum(['ai', 'physician']),
  clinicalReasoning: z.string().max(1000).optional(),
  confidence: z.number().min(0).max(100).optional(),
});

const reorderDifferentialsSchema = z.object({
  encounterId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()),
});

/**
 * GET /api/doctor/queue
 * Get patients ready for doctor review
 */
router.get('/queue', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can access this endpoint',
      });
      return;
    }

    // Get patients ready for review
    const patients = await workflowRepository.getDoctorQueue();

    res.status(200).json({
      message: 'Doctor queue retrieved',
      data: {
        patients,
        count: patients.length,
      },
    });
  } catch (error) {
    logger.error('Error getting doctor queue:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get doctor queue',
    });
  }
});

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
 * POST /api/doctor/patient/:patientId/considerations
 * Generate AI clinical considerations
 */
router.post('/patient/:patientId/considerations', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const validation = generateConsiderationsSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can generate considerations',
      });
      return;
    }

    const { sessionId } = validation.data;

    // Get patient summary
    const summary = await chatRepository.getSummary(sessionId);
    if (!summary) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Patient summary not found',
      });
      return;
    }

    // Get vitals
    const vitals = await vitalsRepository.getBySession(sessionId);

    // Build patient context
    const patientContext = {
      chiefComplaint: summary.chiefComplaint,
      symptoms: summary.symptoms,
      duration: summary.duration,
      severity: summary.severity,
      medicalHistory: summary.medicalHistory,
      currentMedications: summary.currentMedications,
      allergies: summary.allergies,
      vitals: vitals ? {
        bloodPressure: `${vitals.bloodPressureSystolic}/${vitals.bloodPressureDiastolic}`,
        heartRate: vitals.heartRate,
        temperature: vitals.temperatureFahrenheit,
        oxygenSaturation: vitals.oxygenSaturation,
      } : undefined,
    };

    // Generate considerations using LLM
    const aiConsiderations = await llmService.generateClinicalConsiderations(patientContext);

    // Save considerations to database
    const savedConsiderations = await clinicalRepository.saveConsiderations(
      patientId,
      sessionId,
      aiConsiderations
    );

    res.status(200).json({
      message: 'Clinical considerations generated',
      data: {
        considerations: savedConsiderations,
      },
    });
  } catch (error) {
    logger.error('Error generating considerations:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate clinical considerations',
    });
  }
});

/**
 * PUT /api/doctor/consideration/:considerationId
 * Update consideration status (accept/modify/reject)
 */
router.put('/consideration/:considerationId', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { considerationId } = req.params;
    const validation = updateConsiderationSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can update considerations',
      });
      return;
    }

    const { status, doctorNotes } = validation.data;

    await clinicalRepository.updateConsiderationStatus(
      considerationId,
      status,
      req.user!.userId,
      doctorNotes
    );

    res.status(200).json({
      message: 'Consideration updated',
    });
  } catch (error) {
    logger.error('Error updating consideration:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update consideration',
    });
  }
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
        details: validation.error.errors,
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

/**
 * GET /api/doctor/completed-patients
 * Get doctor's completed patients
 */
router.get('/completed-patients', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can access this endpoint',
      });
      return;
    }

    const { limit = '20' } = req.query;

    // Get completed patients for this doctor
    const completedPatients = await workflowRepository.getCompletedPatientsForDoctor(
      req.user!.userId,
      parseInt(limit as string)
    );

    const patients = completedPatients.map((raw: any) => ({
      patientId: raw.patient_id,
      patientName: raw.patient_name,
      patientEmail: raw.patient_email,
      lastSessionId: raw.last_session_id,
      lastVisit: raw.last_visit,
      lastComplaint: raw.last_complaint,
      lastPlan: raw.last_plan,
      reasoningStatus: raw.reasoning_status,
      lastPriority: raw.last_priority,
    }));

    res.status(200).json({
      message: 'Completed patients retrieved',
      data: {
        patients,
        count: patients.length,
      },
    });
  } catch (error) {
    logger.error('Error getting completed patients:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get completed patients',
    });
  }
});

/**
 * POST /api/doctor/encounters/:encounterId/differentials
 * Add a differential diagnosis
 */
router.post('/encounters/:encounterId/differentials', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { encounterId } = req.params;
    const validation = addDifferentialSchema.safeParse(req.body);

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid differential data',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can add differentials',
      });
      return;
    }

    // Get patient ID from encounter
    const patientId = await workflowRepository.getSessionPatientId(encounterId);

    if (!patientId) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Encounter not found',
      });
      return;
    }

    const differentialId = await differentialManager.addDiagnosis({
      encounterId,
      patientId,
      diagnosis: {
        code: validation.data.icdCode,
        name: validation.data.diagnosisName,
        category: validation.data.diagnosisCategory,
      },
      priority: validation.data.priority,
      source: validation.data.source,
      addedBy: req.user!.userId,
      clinicalReasoning: validation.data.clinicalReasoning,
      confidence: validation.data.confidence,
    });

    res.status(201).json({
      message: 'Differential diagnosis added',
      data: { id: differentialId },
    });
  } catch (error) {
    logger.error('Error adding differential:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to add differential diagnosis',
    });
  }
});

/**
 * GET /api/doctor/encounters/:encounterId/differentials
 * Get all differentials for an encounter
 */
router.get('/encounters/:encounterId/differentials', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { encounterId } = req.params;

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can access differentials',
      });
      return;
    }

    const differentials = await differentialManager.getDifferentials(encounterId);

    res.status(200).json({
      message: 'Differentials retrieved',
      data: differentials,
      count: differentials.length,
    });
  } catch (error) {
    logger.error('Error getting differentials:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get differentials',
    });
  }
});

/**
 * DELETE /api/doctor/encounters/:encounterId/differentials/:id
 * Remove a differential diagnosis
 */
router.delete('/encounters/:encounterId/differentials/:id', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can remove differentials',
      });
      return;
    }

    await differentialManager.removeDiagnosis(id);

    res.status(200).json({
      message: 'Differential diagnosis removed',
    });
  } catch (error) {
    logger.error('Error removing differential:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to remove differential diagnosis',
    });
  }
});

/**
 * PUT /api/doctor/encounters/:encounterId/differentials/order
 * Reorder differential diagnoses
 */
router.put('/encounters/:encounterId/differentials/order', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { encounterId } = req.params;
    const validation = reorderDifferentialsSchema.safeParse({
      ...req.body,
      encounterId,
    });

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid reorder data',
        details: validation.error.errors,
      });
      return;
    }

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can reorder differentials',
      });
      return;
    }

    await differentialManager.reorderDiagnoses(
      validation.data.encounterId,
      validation.data.orderedIds
    );

    res.status(200).json({
      message: 'Differentials reordered successfully',
    });
  } catch (error) {
    logger.error('Error reordering differentials:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to reorder differentials',
    });
  }
});

/**
 * GET /api/doctor/diagnoses/search
 * Search ICD-10 diagnoses
 */
router.get('/diagnoses/search', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Search query parameter "q" is required',
      });
      return;
    }

    // Check if user is doctor or admin
    if (req.user!.role !== 'Doctor' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only doctors can search diagnoses',
      });
      return;
    }

    const results = await differentialManager.searchDiagnoses(q);

    res.status(200).json({
      message: 'Diagnosis search results',
      data: results,
      count: results.length,
    });
  } catch (error) {
    logger.error('Error searching diagnoses:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to search diagnoses',
    });
  }
});

export default router;
