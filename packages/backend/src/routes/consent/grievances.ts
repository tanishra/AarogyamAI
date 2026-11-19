import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { randomBytes } from 'crypto';

import { getContainer } from '../../composition';
import { logger } from '../../lib/logger';
import { uuidParam } from '../../lib/uuidParam';
import { writeAuditLog } from './auditLog';

const router = Router();
const grievanceRepo = getContainer().repositories.grievance;
const userRepo = getContainer().repositories.user;
const emailService = getContainer().services.email;

// Validation schemas
const updateGrievanceSchema = z.object({
  status: z.enum(['pending', 'investigating', 'resolved', 'escalated']),
  dpoNotes: z.string().optional(),
});

/**
 * GET /api/grievances
 * Get all grievances
 */
router.get('/grievances', async (_req: Request, res: Response) => {
  try {
    const grievances = await grievanceRepo.findAll();

    res.status(200).json({
      message: 'Grievances retrieved successfully',
      data: grievances,
      count: grievances.length,
    });
  } catch (error) {
    logger.error('Error fetching grievances:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch grievances',
    });
  }
});

/**
 * PUT /api/grievances/:id
 * Update grievance status
 */
router.put('/grievances/:id', async (req: Request, res: Response) => {
  try {
    const { id: rawId } = req.params;
    const id = uuidParam(rawId, res);
    if (!id) return;
    const { status, dpoNotes } = req.body;

    // Validate request
    const validation = updateGrievanceSchema.safeParse({ status, dpoNotes });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.issues,
      });
      return;
    }

    // Check if grievance exists
    const existingGrievance = await grievanceRepo.findById(id);
    if (!existingGrievance) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Grievance not found',
      });
      return;
    }

    // Update grievance
    const updateData: any = { status };
    if (dpoNotes) updateData.dpo_notes = dpoNotes;
    if (status === 'resolved') {
      updateData.resolved_at = new Date();
      updateData.resolved_by = req.user!.userId;
    }

    const updatedGrievance = await grievanceRepo.updateStatus(id, updateData);

    // Create audit log entry
    await writeAuditLog({
      userId: req.user!.userId,
      userName: maskEmail(req.user!.email),
      userRole: req.user!.role,
      actionType: 'grievance_status_updated',
      resource: 'grievance',
      resourceId: id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    // Best-effort notification if resolved — the update is already committed
    if (status === 'resolved') {
      try {
        const grievancePatient = await userRepo.findById(existingGrievance.patient_id);
        if (grievancePatient?.email) {
          await emailService.sendNotificationEmail(
            grievancePatient.email,
            'Grievance Resolved',
            'Your grievance has been reviewed and resolved.'
          );
        }
      } catch (error) {
        logger.error('Failed to send grievance resolution notification:', { error });
      }
    }

    res.status(200).json({
      message: 'Grievance updated successfully',
      data: updatedGrievance,
    });
  } catch (error) {
    logger.error('Error updating grievance:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update grievance',
    });
  }
});

export default router;
