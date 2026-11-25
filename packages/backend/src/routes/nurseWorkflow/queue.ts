import { Router, Request, Response } from 'express';
import { authenticate } from '../../auth/authMiddleware';
import { workflowRepository } from '../../repositories/WorkflowRepository';
import { logger } from '../../lib/logger';

const router = Router();

/**
 * GET /api/nurse/queue
 * Get patients with completed chats waiting for vitals
 */
router.get('/queue', authenticate({}), async (req: Request, res: Response) => {
  try {
    // Check if user is nurse or admin
    if (req.user!.role !== 'Nurse' && req.user!.role !== 'Administrator') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only nurses can access this endpoint',
      });
      return;
    }

    // Get patients in queue
    const patients = await workflowRepository.getNurseQueue();

    res.status(200).json({
      message: 'Nurse queue retrieved',
      data: {
        patients,
        count: patients.length,
      },
    });
  } catch (error) {
    logger.error('Error getting nurse queue:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to get nurse queue',
    });
  }
});

export default router;
