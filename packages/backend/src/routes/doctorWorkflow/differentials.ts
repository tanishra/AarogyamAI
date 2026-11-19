import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { getContainer } from '../../composition';
import { logger } from '../../lib/logger';

const router = Router();
const differentialManager = getContainer().services.differentialManager;

// Validation schemas
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
        details: validation.error.issues,
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
        details: validation.error.issues,
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
