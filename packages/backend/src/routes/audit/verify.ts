import { maskEmail } from '../../lib/pii';
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { logger } from '../../lib/logger';
import { auditLogService, writeAuditLog } from './shared';

const router = Router();

const verifyIntegritySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

/**
 * POST /api/audit/verify
 * Verify audit log integrity via hash chain
 */
router.post('/verify', async (req: Request, res: Response) => {
  try {
    const validation = verifyIntegritySchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.issues,
      });
      return;
    }

    const { startDate, endDate } = validation.data;

    const result = await auditLogService.verifyIntegrity(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    );

    const verificationResult = {
      status: result.isValid ? 'verified' : 'tampered',
      entriesVerified: result.totalEntries,
      tamperedEntries: result.tamperedEntries,
      detail: result.message,
      dateRange: {
        start: startDate || null,
        end: endDate || null,
      },
      verifiedAt: new Date().toISOString(),
      verifiedBy: req.user!.userId,
    };

    await writeAuditLog({
      userId: req.user!.userId,
      userName: maskEmail(req.user!.email),
      userRole: req.user!.role,
      actionType: 'audit_log_verification',
      resource: 'audit_logs',
      outcome: result.isValid ? 'success' : 'failure',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: '',
      hash: '',
    });

    res.status(200).json({
      message: 'Audit log verification completed',
      data: verificationResult,
    });
  } catch (error) {
    logger.error('Error verifying audit logs:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify audit log integrity',
    });
  }
});

export default router;
