import { Router, Request, Response } from 'express';
import { z } from 'zod';

import { getContainer } from '../../composition';
import type { SearchFilters } from '../../repositories/types';
import { logger } from '../../lib/logger';

const router = Router();
const userRepo = getContainer().repositories.user;
const auditRepo = getContainer().repositories.auditLog;

// Validation schemas
const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const activityFilterSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  actionType: z.string().optional(),
});

/**
 * GET /api/admin/users
 * Get all users with pagination
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const validation = paginationSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid pagination parameters',
        details: validation.error.issues,
      });
      return;
    }

    const { page, limit } = validation.data;
    const offset = (page - 1) * limit;

    const users = await userRepo.findAll({ limit, offset });
    
    res.status(200).json({
      message: 'Users retrieved successfully',
      data: users,
      pagination: {
        page,
        limit,
        count: users.length,
      },
    });
  } catch (error) {
    logger.error('Error fetching users:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch users',
    });
  }
});

/**
 * GET /api/admin/users/:id
 * Get user details by ID
 */
router.get('/users/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const user = await userRepo.findById(id);
    
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }
    
    res.status(200).json({
      message: 'User retrieved successfully',
      data: user,
    });
  } catch (error) {
    logger.error('Error fetching user:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user',
    });
  }
});

/**
 * GET /api/admin/users/:id/activity
 * Get user activity history
 */
router.get('/users/:id/activity', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    // Validate query parameters
    const validation = activityFilterSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.issues,
      });
      return;
    }

    const { page, limit, startDate, endDate, actionType } = validation.data;

    // Check if user exists
    const user = await userRepo.findById(id);
    if (!user) {
      res.status(404).json({
        error: 'Not Found',
        message: 'User not found',
      });
      return;
    }

    // Build filter
    const filter: SearchFilters = { userId: id };
    if (startDate) filter.startDate = new Date(startDate);
    if (endDate) filter.endDate = new Date(endDate);
    if (actionType) filter.actionType = actionType;

    // Fetch activity logs
    const result = await auditRepo.search({
      ...filter,
      limit,
      page,
    });

    res.status(200).json({
      message: 'User activity retrieved successfully',
      data: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        hasMore: result.hasMore,
      },
    });
  } catch (error) {
    logger.error('Error fetching user activity:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch user activity',
    });
  }
});

export default router;
