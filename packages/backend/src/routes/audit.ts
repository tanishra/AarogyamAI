import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticate } from '../auth/authMiddleware';
import { requireAdminOrDPO } from '../auth/authorizationMiddleware';

import { getContainer } from '../composition';
import { logger } from '../lib/logger';

const router = Router();
const auditRepo = getContainer().repositories.auditLog;
const auditLogService = getContainer().services.auditLog;
const anomalyService = getContainer().services.anomalyDetection;

// Audit logging helper (repository no-ops persistence when DynamoDB is disabled)
const writeAuditLog = async (data: any) => {
  await auditRepo.create(data);
};

// Apply authentication and authorization middleware to all routes
router.use(authenticate({}));
router.use(requireAdminOrDPO());

// Validation schemas
const searchLogsSchema = z.object({
  userId: z.string().uuid().optional(),
  actionType: z.string().optional(),
  resource: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const accessPatternSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

const verifyIntegritySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

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
        details: validation.error.errors,
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

    // Search audit logs (fallback to empty if DynamoDB not configured)
    const result = await auditRepo.search(filter).catch((err) => {
      logger.debug('Audit logs not available (DynamoDB not configured for MVP):', err.message);
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

/**
 * GET /api/audit/access-patterns/:patientId
 * Get access pattern analysis for a patient 
 */
router.get('/access-patterns/:patientId', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    
    const validation = accessPatternSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
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
        details: validation.error.errors,
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
      userName: req.user!.email,
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

/**
 * POST /api/audit/export
 * Export audit logs as CSV
 */
router.post('/export', async (req: Request, res: Response) => {
  try {
    const validation = searchLogsSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    const { userId, actionType, resource, startDate, endDate } = validation.data;

    const searchResult = await auditRepo.search({
      userId,
      actionType,
      resource,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      limit: 10000,
      page: 1,
    });
    const items = searchResult.items;

    const header = 'id,user_id,user_name,user_role,action_type,resource,resource_id,outcome,ip_address,timestamp';
    const escape = (v: unknown) => {
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const csv = [
      header,
      ...items.map((e: any) =>
        [
          e.id, e.userId, e.userName, e.userRole, e.actionType,
          e.resource, e.resourceId, e.outcome, e.ipAddress, e.timestamp,
        ].map(escape).join(',')
      ),
    ].join('\n');

    const exportResult = {
      exportId: `export-${Date.now()}`,
      format: 'csv',
      filters: { userId, actionType, resource, startDate, endDate },
      recordCount: items.length,
      fileSize: `${(Buffer.byteLength(csv) / 1024).toFixed(1)} KB`,
      generatedAt: new Date().toISOString(),
      generatedBy: req.user!.userId,
      csv,
    };

    await writeAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'audit_log_export',
      resource: 'audit_logs',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: '',
      hash: '',
    });

    res.status(200).json({
      message: 'Audit log export completed',
      data: exportResult,
    });
  } catch (error) {
    logger.error('Error exporting audit logs:', { error });
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to export audit logs',
    });
  }
});

export default router;
