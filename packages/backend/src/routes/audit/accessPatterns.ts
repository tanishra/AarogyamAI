import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { uuidParam } from '../../lib/uuidParam';
import { auditRepo } from './shared';

const router = Router();

const accessPatternSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * GET /api/audit/access-patterns/:patientId
 * Get access pattern analysis for a patient 
 */
router.get('/access-patterns/:patientId', async (req: Request, res: Response) => {
  try {
    const { patientId: rawPatientId } = req.params;
    const patientId = uuidParam(rawPatientId, res);
    if (!patientId) return;
    
    const validation = accessPatternSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.issues,
      });
      return;
    }

    const { startDate, endDate } = validation.data;

    const patterns = await auditRepo.getAccessPatterns(patientId, startDate, endDate);

    res.status(200).json({
      message: 'Access patterns retrieved successfully',
      data: {
        patientId,
        dateRange: {
          start: startDate || null,
          end: endDate || null,
        },
        ...patterns,
      },
    });
  } catch (error) {
    logger.error('Error fetching access patterns:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch access patterns',
    });
  }
});

export default router;
