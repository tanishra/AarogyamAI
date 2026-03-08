import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { ConsentRepository } from '../repositories/ConsentRepository';
import { GrievanceRepository } from '../repositories/GrievanceRepository';
import { DataAccessRequestRepository } from '../repositories/DataAccessRequestRepository';
import { AuditLogRepository } from '../repositories/AuditLogRepository';
import { authenticate } from '../auth/authMiddleware';
import { requireAdminOrDPO } from '../auth/authorizationMiddleware';
import { randomBytes } from 'crypto';

const router = Router();
const consentRepo = new ConsentRepository();
const grievanceRepo = new GrievanceRepository();
const dataAccessRepo = new DataAccessRequestRepository();

// Mock audit logging for MVP (DynamoDB not configured)
const mockAuditLog = async (data: any) => {
  console.log('[AUDIT LOG - DISABLED FOR MVP]:', data.actionType, data.userId);
};

// Apply authentication and authorization middleware to all routes (Administrator or DPO)
router.use(authenticate({}));
router.use(requireAdminOrDPO());

// Validation schemas
const consentRecordsSchema = z.object({
  patientId: z.string().uuid().optional(),
  status: z.enum(['active', 'withdrawn', 'expired']).optional(),
  consentType: z.string().optional(),
});

const updateGrievanceSchema = z.object({
  status: z.enum(['pending', 'investigating', 'resolved', 'escalated']),
  dpoNotes: z.string().optional(),
});

const fulfillDataAccessRequestSchema = z.object({
  responseDocumentUrl: z.string().url(),
});

const complianceReportSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  format: z.enum(['pdf', 'csv']).default('pdf'),
});

/**
 * GET /consent/records
 * Get consent records with optional filters
 */
router.get('/consent/records', async (req: Request, res: Response) => {
  try {
    const validation = consentRecordsSchema.safeParse(req.query);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
      return;
    }

    const { patientId, status, consentType } = validation.data;

    // Build filters
    const filters: any = {};
    if (patientId) filters.patient_id = patientId;
    if (status) filters.status = status;
    if (consentType) filters.consent_type = consentType;

    // Fetch consent records
    const records = await consentRepo.findAll(filters);

    res.status(200).json({
      message: 'Consent records retrieved successfully',
      data: records,
      count: records.length,
    });
  } catch (error) {
    console.error('Error fetching consent records:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch consent records',
    });
  }
});

/**
 * GET /consent/withdrawal-requests
 * Get pending consent withdrawal requests
 */
router.get('/consent/withdrawal-requests', async (_req: Request, res: Response) => {
  try {
    const requests = await consentRepo.getPendingWithdrawals();

    res.status(200).json({
      message: 'Consent withdrawal requests retrieved successfully',
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    console.error('Error fetching withdrawal requests:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch consent withdrawal requests',
    });
  }
});

/**
 * POST /consent/withdrawal-requests/:id/process
 * Process a consent withdrawal request
 */
router.post('/consent/withdrawal-requests/:id/process', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Process the withdrawal request
    const withdrawalRequest = await consentRepo.processWithdrawalRequest(
      id,
      req.user!.userId
    );

    if (!withdrawalRequest) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Withdrawal request not found or already processed',
      });
      return;
    }

    // Withdraw the consent record
    const consentRecord = await consentRepo.withdraw(withdrawalRequest.consent_id);

    if (!consentRecord) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to withdraw consent record',
      });
      return;
    }

    // Create audit log entry
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'consent_withdrawal_processed',
      resource: 'consent_record',
      resourceId: withdrawalRequest.consent_id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    // Mock email notification
    console.log(`[MOCK EMAIL] Consent withdrawal confirmed for patient ${withdrawalRequest.patient_id}`);

    res.status(200).json({
      message: 'Consent withdrawal processed successfully',
      data: {
        withdrawalRequest,
        consentRecord,
      },
    });
  } catch (error) {
    console.error('Error processing withdrawal request:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process consent withdrawal request',
    });
  }
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
    console.error('Error fetching grievances:', error);
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
    const { id } = req.params;
    const { status, dpoNotes } = req.body;

    // Validate request
    const validation = updateGrievanceSchema.safeParse({ status, dpoNotes });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
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
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
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

    // Send email notification if resolved
    if (status === 'resolved') {
      console.log(`[MOCK EMAIL] Grievance resolved notification sent to patient ${existingGrievance.patient_id}`);
    }

    res.status(200).json({
      message: 'Grievance updated successfully',
      data: updatedGrievance,
    });
  } catch (error) {
    console.error('Error updating grievance:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to update grievance',
    });
  }
});

/**
 * GET /api/data-access-requests
 * Get all data access requests
 */
router.get('/data-access-requests', async (_req: Request, res: Response) => {
  try {
    const requests = await dataAccessRepo.findAll();

    res.status(200).json({
      message: 'Data access requests retrieved successfully',
      data: requests,
      count: requests.length,
    });
  } catch (error) {
    console.error('Error fetching data access requests:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch data access requests',
    });
  }
});

/**
 * PUT /api/data-access-requests/:id/fulfill
 * Fulfill a data access request
 */
router.put('/data-access-requests/:id/fulfill', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { responseDocumentUrl } = req.body;

    // Validate request
    const validation = fulfillDataAccessRequestSchema.safeParse({ responseDocumentUrl });
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    // Fulfill the request
    const fulfilledRequest = await dataAccessRepo.fulfill(
      id,
      req.user!.userId,
      responseDocumentUrl
    );

    if (!fulfilledRequest) {
      res.status(404).json({
        error: 'Not Found',
        message: 'Data access request not found or already fulfilled',
      });
      return;
    }

    // Create audit log entry
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'data_access_request_fulfilled',
      resource: 'data_access_request',
      resourceId: id,
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    // Mock email notification
    console.log(`[MOCK EMAIL] Data access request fulfilled for patient ${fulfilledRequest.patient_id}`);

    res.status(200).json({
      message: 'Data access request fulfilled successfully',
      data: fulfilledRequest,
    });
  } catch (error) {
    console.error('Error fulfilling data access request:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fulfill data access request',
    });
  }
});

/**
 * POST /api/compliance/reports
 * Generate compliance report (mock for MVP)
 */
router.post('/compliance/reports', async (req: Request, res: Response) => {
  try {
    const validation = complianceReportSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request data',
        details: validation.error.errors,
      });
      return;
    }

    const { startDate, endDate, format } = validation.data;

    // Mock compliance report generation for MVP
    const mockReport = {
      reportId: `report-${Date.now()}`,
      format,
      dateRange: {
        start: startDate,
        end: endDate,
      },
      summary: {
        consentRecords: {
          total: 1250,
          active: 1100,
          withdrawn: 120,
          expired: 30,
        },
        withdrawalRequests: {
          total: 45,
          processed: 42,
          pending: 3,
          avgProcessingTime: '18 hours',
        },
        grievances: {
          total: 12,
          pending: 2,
          investigating: 3,
          resolved: 6,
          escalated: 1,
          avgResolutionTime: '5 days',
        },
        dataAccessRequests: {
          total: 28,
          pending: 4,
          fulfilled: 24,
          avgFulfillmentTime: '48 hours',
        },
        dataBreaches: {
          total: 0,
          incidents: [],
        },
      },
      downloadUrl: `https://mock-s3-bucket.s3.amazonaws.com/reports/compliance-${Date.now()}.${format}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour
      generatedAt: new Date().toISOString(),
      generatedBy: req.user!.userId,
    };

    // Create audit log entry
    await mockAuditLog({
      userId: req.user!.userId,
      userName: req.user!.email,
      userRole: req.user!.role,
      actionType: 'compliance_report_generated',
      resource: 'compliance_report',
      outcome: 'success',
      ipAddress: req.ip || 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      requestId: randomBytes(16).toString('hex'),
      hash: '',
    });

    res.status(200).json({
      message: 'Compliance report generated successfully (mock)',
      data: mockReport,
      note: 'This is placeholder functionality for MVP. Full implementation pending.',
    });
  } catch (error) {
    console.error('Error generating compliance report:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to generate compliance report',
    });
  }
});

export default router;
