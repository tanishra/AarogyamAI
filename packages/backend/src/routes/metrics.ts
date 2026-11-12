import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { requireAdministrator } from '../auth/authorizationMiddleware';
import { getContainer } from '../composition';
import { logger } from '../lib/logger';

const router = Router();

// Apply authentication and authorization middleware to all routes
router.use(authenticate({}));
router.use(requireAdministrator());

// Validation schemas
const periodSchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly']).default('daily'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const metricsRepo = () => getContainer().repositories.metrics;

/**
 * GET /api/metrics/consultations
 * Consultation volume metrics (real aggregation)
 */
router.get('/consultations', async (req: Request, res: Response) => {
  try {
    const validation = periodSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { period } = validation.data;
    const data = await metricsRepo().getConsultationMetrics();

    res.status(200).json({
      message: 'Consultation metrics retrieved successfully',
      data,
      period,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching consultation metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch consultation metrics',
    });
  }
});

/**
 * GET /api/metrics/active-users
 * Active user metrics (real aggregation)
 */
router.get('/active-users', async (_req: Request, res: Response) => {
  try {
    const data = await metricsRepo().getActiveUserMetrics();

    res.status(200).json({
      message: 'Active user metrics retrieved successfully',
      data,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching active user metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch active user metrics',
    });
  }
});

/**
 * GET /api/metrics/ai-acceptance
 * AI consideration acceptance rate (real aggregation)
 */
router.get('/ai-acceptance', async (req: Request, res: Response) => {
  try {
    const validation = periodSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { period } = validation.data;
    const data = await metricsRepo().getAIAcceptanceMetrics();

    res.status(200).json({
      message: 'AI acceptance rate metrics retrieved successfully',
      data,
      period,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching AI acceptance metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch AI acceptance metrics',
    });
  }
});

/**
 * GET /api/metrics/preparation-time
 * Intake preparation time metrics (real aggregation)
 */
router.get('/preparation-time', async (req: Request, res: Response) => {
  try {
    const validation = periodSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { period } = validation.data;
    const data = await metricsRepo().getPreparationTimeMetrics();

    res.status(200).json({
      message: 'Preparation time metrics retrieved successfully',
      data,
      period,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching preparation time metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch preparation time metrics',
    });
  }
});

/**
 * GET /api/metrics/questionnaire-completion
 * Questionnaire completion metrics (real aggregation)
 */
router.get('/questionnaire-completion', async (req: Request, res: Response) => {
  try {
    const validation = periodSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { period } = validation.data;
    const data = await metricsRepo().getQuestionnaireCompletionMetrics();

    res.status(200).json({
      message: 'Questionnaire completion metrics retrieved successfully',
      data,
      period,
      cached: false,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching questionnaire completion metrics:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch questionnaire completion metrics',
    });
  }
});

/**
 * GET /api/metrics/dashboard-summary
 * Combined metrics for the admin dashboard (real aggregation)
 */
router.get('/dashboard-summary', async (_req: Request, res: Response) => {
  try {
    const data = await metricsRepo().getDashboardSummary();

    res.status(200).json({
      message: 'Dashboard summary retrieved successfully',
      data,
      cached: false,
    });
  } catch (error) {
    logger.error('Error fetching dashboard summary:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch dashboard summary',
    });
  }
});

export default router;
