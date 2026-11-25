import { Router, Request, Response } from 'express';
import { logger } from '../../lib/logger';
import { auditRepo, searchLogsSchema } from './shared';

const router = Router();

/**
 * GET /api/audit/logs
 * Search and filter audit logs
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const validation = searchLogsSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.issues,
      });
      return;
    }

    const { userId, actionType, resource, startDate, endDate, page, limit } = validation.data;

    // Build filter
    const filter: any = { page, limit };
    if (userId) filter.userId = userId;
    if (actionType) filter.actionType = actionType;
    if (resource) filter.resource = resource;
    if (startDate) filter.startDate = new Date(startDate);
    if (endDate) filter.endDate = new Date(endDate);

    // Search audit logs (degrade to empty page rather than 500)
    const result = await auditRepo.search(filter).catch((err) => {
      logger.debug('Audit log search failed:', err.message);
      return {
        items: [],
        total: 0,
        page: page || 1,
        limit: limit || 50,
        hasMore: false,
      };
    });

    res.status(200).json({
      message: 'Audit logs retrieved successfully',
      data: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    logger.error('Error searching audit logs:', { error });
    // Return empty result instead of 500 for MVP
    res.status(200).json({
      message: 'Audit logs retrieved successfully',
      data: [],
      pagination: {
        page: 1,
        limit: 50,
        total: 0,
        hasMore: false,
      },
    });
  }
});

/**
 * GET /api/audit/logs/:id
 * Get single audit log entry by ID
 */
router.get('/logs/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Search for the specific log entry
    // Since we don't have a direct findById method, we'll search all logs
    // In a production system, you'd want to add a GSI on id
    const result = await auditRepo.search({ limit: 1000 });
    const logEntry = result.items.find(entry => entry.id === id);

    if (!logEntry) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Audit log entry not found',
      });
      return;
    }

    res.status(200).json({
      message: 'Audit log entry retrieved successfully',
      data: logEntry,
    });
  } catch (error) {
    logger.error('Error fetching audit log entry:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch audit log entry',
    });
  }
});

export default router;
