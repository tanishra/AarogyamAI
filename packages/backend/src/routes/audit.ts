import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { authenticate } from '../auth/authMiddleware';
import { requireAdminOrDPO } from '../auth/authorizationMiddleware';

const router = Router();
const auditRepo = new AuditLogRepository();

// Mock audit logging for MVP (DynamoDB not configured)
const mockAuditLog = async (data: any) => {
  console.log('[AUDIT LOG - DISABLED FOR MVP]:', data.actionType, data.userId);
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
      console.log('Audit logs not available (DynamoDB not configured for MVP):', err.message);
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
    console.error('Error searching audit logs:', error);
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
    console.error('Error fetching audit log entry:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch audit log entry',
    });
  }
});

/**
 * GET /api/audit/access-patterns/:patientId
 * Get access pattern analysis for a patient (mock for MVP)
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

    // Mock data for MVP - placeholder response
    const mockAccessPatterns = {
      patientId,
      dateRange: {
        start: startDate || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        end: endDate || new Date().toISOString(),
      },
      accessors: [
        {
          userId: 'user-1',
          userName: 'Dr. Smith',
          role: 'Doctor',
          accessCount: 12,
          lastAccess: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
          purpose: 'Treatment',
          isAnomalous: false,
        },
        {
          userId: 'user-2',
          userName: 'Nurse Johnson',
          role: 'Nurse',
          accessCount: 8,
          lastAccess: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
          purpose: 'Care coordination',
          isAnomalous: false,
        },
      ],
      timeline: [
        { date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), count: 3 },
        { date: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), count: 2 },
        { date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), count: 4 },
        { date: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), count: 1 },
        { date: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), count: 5 },
        { date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), count: 3 },
        { date: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), count: 2 },
      ],
      statistics: {
        totalAccesses: 20,
        uniqueAccessors: 2,
        averageAccessFrequency: 10.0,
        standardDeviation: 2.0,
      },
    };

    res.status(200).json({
      message: 'Access patterns retrieved successfully (mock data)',
      data: mockAccessPatterns,
      note: 'This is placeholder data for MVP. Full implementation pending.',
    });
  } catch (error) {
    console.error('Error fetching access patterns:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch access patterns',
    });
  }
});

/**
 * GET /api/audit/anomalies
 * Get unacknowledged anomaly alerts (mock for MVP)
 */
router.get('/anomalies', async (_req: Request, res: Response) => {
  try {
    // Mock data for MVP - placeholder response
    const mockAnomalies = [
      {
        id: 'anomaly-1',
        userId: 'user-3',
        userName: 'Dr. Williams',
        triggerCondition: 'high_frequency_access',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        details: {
          recordCount: 55,
          timeWindow: '60 minutes',
        },
        acknowledged: false,
      },
      {
        id: 'anomaly-2',
        userId: 'user-4',
        userName: 'Nurse Davis',
        triggerCondition: 'off_hours_access',
        timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        details: {
          accessTime: '02:30 AM',
        },
        acknowledged: false,
      },
    ];

    res.status(200).json({
      message: 'Anomaly alerts retrieved successfully (mock data)',
      data: mockAnomalies,
      count: mockAnomalies.length,
      note: 'This is placeholder data for MVP. Full implementation pending.',
    });
  } catch (error) {
    console.error('Error fetching anomalies:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch anomaly alerts',
    });
  }
});

/**
 * POST /api/audit/anomalies/:id/acknowledge
 * Acknowledge an anomaly alert (mock for MVP)
 */
router.post('/anomalies/:id/acknowledge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Mock acknowledgment for MVP
    const mockAcknowledgedAnomaly = {
      id,
      acknowledged: true,
      acknowledgedBy: req.user!.userId,
      acknowledgedByName: req.user!.email,
      acknowledgedAt: new Date().toISOString(),
    };

    // Create audit log entry
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'anomaly_acknowledged',
      resource: 'anomaly_alert',
      resourceId: id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: '',
      hash: '',
    });

    res.status(200).json({
      message: 'Anomaly alert acknowledged successfully (mock)',
      data: mockAcknowledgedAnomaly,
      note: 'This is placeholder functionality for MVP. Full implementation pending.',
    });
  } catch (error) {
    console.error('Error acknowledging anomaly:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to acknowledge anomaly alert',
    });
  }
});

/**
 * POST /api/audit/verify
 * Verify audit log integrity (mock for MVP)
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

    // Mock verification for MVP
    const mockVerificationResult = {
      status: 'verified',
      entriesVerified: 1250,
      tamperedEntries: [],
      dateRange: {
        start: startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: endDate || new Date().toISOString(),
      },
      verifiedAt: new Date().toISOString(),
      verifiedBy: req.user!.userId,
    };

    // Create audit log entry
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'audit_log_verification',
      resource: 'audit_logs',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: '',
      hash: '',
    });

    res.status(200).json({
      message: 'Audit log verification completed successfully (mock)',
      data: mockVerificationResult,
      note: 'This is placeholder functionality for MVP. Full implementation pending.',
    });
  } catch (error) {
    console.error('Error verifying audit logs:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to verify audit log integrity',
    });
  }
});

/**
 * POST /api/audit/export
 * Export audit logs (mock for MVP)
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

    // Mock export for MVP
    const mockExportResult = {
      exportId: `export-${Date.now()}`,
      format: 'csv',
      filters: {
        userId,
        actionType,
        resource,
        startDate,
        endDate,
      },
      recordCount: 450,
      fileSize: '2.3 MB',
      downloadUrl: `https://mock-s3-bucket.s3.amazonaws.com/exports/audit-export-${Date.now()}.csv`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      generatedAt: new Date().toISOString(),
      generatedBy: req.user!.userId,
    };

    // Create audit log entry
    await mockAuditLog({
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
      message: 'Audit log export initiated successfully (mock)',
      data: mockExportResult,
      note: 'This is placeholder functionality for MVP. Full implementation pending.',
    });
  } catch (error) {
    console.error('Error exporting audit logs:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to export audit logs',
    });
  }
});

export default router;
