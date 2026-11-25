import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';
import { alertingService } from './shared';

const router = Router();

const acknowledgeAlertSchema = z.object({
  acknowledgedBy: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

/**
 * GET /api/nurse/alerts/active
 * Get all active critical alerts
 */
router.get('/alerts/active', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access alerts',
      });
      return;
    }

    const alerts = await workflowRepository.getActiveAlerts();

    res.status(200).json({
      message: 'Active alerts retrieved',
      data: alerts,
      count: alerts.length,
    });
  } catch (error) {
    logger.error('Error getting active alerts:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get active alerts',
    });
  }
});

/**
 * POST /api/nurse/alerts/:alertId/acknowledge
 * Acknowledge a critical alert
 */
router.post('/alerts/:alertId/acknowledge', authenticate({}), async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const validation = acknowledgeAlertSchema.safeParse({
      acknowledgedBy: req.user!.userId,
      notes: req.body.notes,
    });

    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid acknowledgment data',
        details: validation.error.issues,
      });
      return;
    }

    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can acknowledge alerts',
      });
      return;
    }

    await alertingService.acknowledgeAlert(
      alertId,
      validation.data.acknowledgedBy
    );

    res.status(200).json({
      message: 'Alert acknowledged successfully',
    });
  } catch (error) {
    logger.error('Error acknowledging alert:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to acknowledge alert',
    });
  }
});

export default router;
