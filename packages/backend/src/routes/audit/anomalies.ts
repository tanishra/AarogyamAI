import { Router, Request, Response } from 'express';
import { logger } from '../../lib/logger';
import { anomalyService } from './shared';

const router = Router();

/**
 * GET /api/audit/anomalies
 * Get unacknowledged anomaly alerts 
 */
router.get('/anomalies', async (_req: Request, res: Response) => {
  try {
    const anomalies = await anomalyService.getUnacknowledgedAlerts();

    res.status(200).json({
      message: 'Anomaly alerts retrieved successfully',
      data: anomalies,
      count: anomalies.length,
    });
  } catch (error) {
    logger.error('Error fetching anomalies:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch anomaly alerts',
    });
  }
});

/**
 * POST /api/audit/anomalies/:id/acknowledge
 * Acknowledge an anomaly alert 
 */
router.post('/anomalies/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const acknowledged = await anomalyService.acknowledgeAnomaly(
      id,
      req.user!.userId,
      req.user!.email,
      req.ip || 'unknown',
      req.headers['user-agent'] || 'unknown',
      ''
    );

    res.status(200).json({
      message: 'Anomaly alert acknowledged successfully',
      data: acknowledged,
    });
  } catch (error) {
    logger.error('Error acknowledging anomaly:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to acknowledge anomaly alert',
    });
  }
});

export default router;
