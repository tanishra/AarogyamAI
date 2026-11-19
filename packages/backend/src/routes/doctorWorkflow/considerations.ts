import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { chatRepository } from '../../repositories/ChatRepository';
import { vitalsRepository } from '../../repositories/VitalsRepository';
import { clinicalRepository } from '../../repositories/ClinicalRepository';
import { llmService } from '../../services/LLMService';
import { logger } from '../../lib/logger';

const router = Router();

// Validation schemas
const generateConsiderationsSchema = z.object({
  sessionId: z.string().uuid(),
});

const updateConsiderationSchema = z.object({
  considerationId: z.string().uuid(),
  status: z.enum(['accepted', 'modified', 'rejected']),
  doctorNotes: z.string().max(1000).optional(),
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
        details: validation.error.issues,
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
        details: validation.error.issues,
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

export default router;
