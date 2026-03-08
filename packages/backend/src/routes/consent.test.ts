import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import consentRoutes from './consent';

// Mock the repositories and middleware
vi.mock('../repositories/ConsentRepository', () => {
  const mockFindAll = vi.fn();
  const mockGetPendingWithdrawals = vi.fn();
  const mockProcessWithdrawalRequest = vi.fn();
  const mockWithdraw = vi.fn();
  
  return {
    ConsentRepository: vi.fn().mockImplementation(() => ({
      findAll: mockFindAll,
      getPendingWithdrawals: mockGetPendingWithdrawals,
      processWithdrawalRequest: mockProcessWithdrawalRequest,
      withdraw: mockWithdraw,
    })),
    mockFindAll,
    mockGetPendingWithdrawals,
    mockProcessWithdrawalRequest,
    mockWithdraw,
  };
});

vi.mock('../repositories/GrievanceRepository', () => {
  const mockFindAll = vi.fn();
  const mockFindById = vi.fn();
  const mockUpdateStatus = vi.fn();
  
  return {
    GrievanceRepository: vi.fn().mockImplementation(() => ({
      findAll: mockFindAll,
      findById: mockFindById,
      updateStatus: mockUpdateStatus,
    })),
    mockFindAll,
    mockFindById,
    mockUpdateStatus,
  };
});

vi.mock('../repositories/DataAccessRequestRepository', () => {
  const mockFindAll = vi.fn();
  const mockFulfill = vi.fn();
  
  return {
    DataAccessRequestRepository: vi.fn().mockImplementation(() => ({
      findAll: mockFindAll,
      fulfill: mockFulfill,
    })),
    mockFindAll,
    mockFulfill,
  };
});

vi.mock('../repositories/AuditLogRepository', () => {
  const mockCreate = vi.fn();
  
  return {
    AuditLogRepository: vi.fn().mockImplementation(() => ({
      create: mockCreate,
    })),
    mockCreate,
  };
});

vi.mock('../auth/authMiddleware', () => ({
  authenticate: () => (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'test-dpo-id',
      email: 'dpo@test.com',
      role: 'DPO',
    };
    next();
  },
}));

vi.mock('../auth/authorizationMiddleware', () => ({
  requireDPO: () => (_req: any, _res: any, next: any) => next(),
}));

describe('Consent Routes', () => {
  let app: Express;
  let mockConsentFindAll: any;
  let mockGetPendingWithdrawals: any;
  let mockProcessWithdrawalRequest: any;
  let mockWithdraw: any;
  let mockGrievanceFindAll: any;
  let mockGrievanceFindById: any;
  let mockGrievanceUpdateStatus: any;
  let mockDataAccessFindAll: any;
  let mockDataAccessFulfill: any;
  let mockAuditCreate: any;

  beforeEach(async () => {
    // Get the mocked functions
    const consentMocks = await import('../repositories/ConsentRepository');
    mockConsentFindAll = consentMocks.mockFindAll;
    mockGetPendingWithdrawals = consentMocks.mockGetPendingWithdrawals;
    mockProcessWithdrawalRequest = consentMocks.mockProcessWithdrawalRequest;
    mockWithdraw = consentMocks.mockWithdraw;

    const grievanceMocks = await import('../repositories/GrievanceRepository');
    mockGrievanceFindAll = grievanceMocks.mockFindAll;
    mockGrievanceFindById = grievanceMocks.mockFindById;
    mockGrievanceUpdateStatus = grievanceMocks.mockUpdateStatus;

    const dataAccessMocks = await import('../repositories/DataAccessRequestRepository');
    mockDataAccessFindAll = dataAccessMocks.mockFindAll;
    mockDataAccessFulfill = dataAccessMocks.mockFulfill;

    const auditMocks = await import('../repositories/AuditLogRepository');
    mockAuditCreate = auditMocks.mockCreate;
    
    // Reset mocks
    mockConsentFindAll.mockReset();
    mockGetPendingWithdrawals.mockReset();
    mockProcessWithdrawalRequest.mockReset();
    mockWithdraw.mockReset();
    mockGrievanceFindAll.mockReset();
    mockGrievanceFindById.mockReset();
    mockGrievanceUpdateStatus.mockReset();
    mockDataAccessFindAll.mockReset();
    mockDataAccessFulfill.mockReset();
    mockAuditCreate.mockReset();
    
    // Setup express app
    app = express();
    app.use(express.json());
    app.use('/api', consentRoutes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/consent/records', () => {
    it('should return consent records', async () => {
      const now = new Date().toISOString();
      const mockRecords = [
        {
          id: 'consent-1',
          patient_id: 'patient-1',
          consent_type: 'data_processing',
          data_categories: ['medical_history', 'prescriptions'],
          processing_purposes: ['treatment', 'research'],
          granted_at: now,
          status: 'active',
          created_at: now,
          updated_at: now,
        },
      ];

      mockConsentFindAll.mockResolvedValue(mockRecords);

      const response = await request(app).get('/api/consent/records');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Consent records retrieved successfully');
      expect(response.body.data).toEqual(mockRecords);
      expect(response.body.count).toBe(1);
    });

    it('should filter consent records by status', async () => {
      mockConsentFindAll.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/consent/records')
        .query({ status: 'active' });

      expect(response.status).toBe(200);
      expect(mockConsentFindAll).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'active',
        })
      );
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/consent/records')
        .query({ status: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bad Request');
    });
  });

  describe('GET /api/consent/withdrawal-requests', () => {
    it('should return pending withdrawal requests', async () => {
      const now = new Date().toISOString();
      const mockRequests = [
        {
          id: 'withdrawal-1',
          consent_id: 'consent-1',
          patient_id: 'patient-1',
          requested_at: now,
          status: 'pending',
          created_at: now,
        },
      ];

      mockGetPendingWithdrawals.mockResolvedValue(mockRequests);

      const response = await request(app).get('/api/consent/withdrawal-requests');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Consent withdrawal requests retrieved successfully');
      expect(response.body.data).toEqual(mockRequests);
      expect(response.body.count).toBe(1);
    });
  });

  describe('POST /api/consent/withdrawal-requests/:id/process', () => {
    it('should process a withdrawal request', async () => {
      const now = new Date().toISOString();
      const mockWithdrawalRequest = {
        id: 'withdrawal-1',
        consent_id: 'consent-1',
        patient_id: 'patient-1',
        requested_at: now,
        processed_at: now,
        processed_by: 'test-dpo-id',
        status: 'processed',
        created_at: now,
      };

      const mockConsentRecord = {
        id: 'consent-1',
        patient_id: 'patient-1',
        consent_type: 'data_processing',
        data_categories: ['medical_history'],
        processing_purposes: ['treatment'],
        granted_at: now,
        withdrawn_at: now,
        status: 'withdrawn',
        created_at: now,
        updated_at: now,
      };

      mockProcessWithdrawalRequest.mockResolvedValue(mockWithdrawalRequest);
      mockWithdraw.mockResolvedValue(mockConsentRecord);
      mockAuditCreate.mockResolvedValue({});

      const response = await request(app)
        .post('/api/consent/withdrawal-requests/withdrawal-1/process');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Consent withdrawal processed successfully');
      expect(response.body.data.withdrawalRequest).toEqual(mockWithdrawalRequest);
      expect(response.body.data.consentRecord).toEqual(mockConsentRecord);
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'consent_withdrawal_processed',
          resource: 'consent_record',
        })
      );
    });

    it('should return 404 if withdrawal request not found', async () => {
      mockProcessWithdrawalRequest.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/consent/withdrawal-requests/nonexistent/process');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('GET /api/grievances', () => {
    it('should return all grievances', async () => {
      const now = new Date().toISOString();
      const mockGrievances = [
        {
          id: 'grievance-1',
          patient_id: 'patient-1',
          submitted_at: now,
          status: 'pending',
          description: 'Test grievance',
          created_at: now,
          updated_at: now,
        },
      ];

      mockGrievanceFindAll.mockResolvedValue(mockGrievances);

      const response = await request(app).get('/api/grievances');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Grievances retrieved successfully');
      expect(response.body.data).toEqual(mockGrievances);
      expect(response.body.count).toBe(1);
    });
  });

  describe('PUT /api/grievances/:id', () => {
    it('should update grievance status', async () => {
      const now = new Date().toISOString();
      const mockExistingGrievance = {
        id: 'grievance-1',
        patient_id: 'patient-1',
        submitted_at: now,
        status: 'pending',
        description: 'Test grievance',
        created_at: now,
        updated_at: now,
      };

      const mockUpdatedGrievance = {
        ...mockExistingGrievance,
        status: 'investigating',
        dpo_notes: 'Under investigation',
      };

      mockGrievanceFindById.mockResolvedValue(mockExistingGrievance);
      mockGrievanceUpdateStatus.mockResolvedValue(mockUpdatedGrievance);
      mockAuditCreate.mockResolvedValue({});

      const response = await request(app)
        .put('/api/grievances/grievance-1')
        .send({
          status: 'investigating',
          dpoNotes: 'Under investigation',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Grievance updated successfully');
      expect(response.body.data).toEqual(mockUpdatedGrievance);
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'grievance_status_updated',
          resource: 'grievance',
        })
      );
    });

    it('should return 404 if grievance not found', async () => {
      mockGrievanceFindById.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/grievances/nonexistent')
        .send({ status: 'investigating' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
    });

    it('should validate request data', async () => {
      const response = await request(app)
        .put('/api/grievances/grievance-1')
        .send({ status: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bad Request');
    });
  });

  describe('GET /api/data-access-requests', () => {
    it('should return all data access requests', async () => {
      const now = new Date().toISOString();
      const mockRequests = [
        {
          id: 'request-1',
          patient_id: 'patient-1',
          request_type: 'data_copy',
          requested_scope: 'All medical records',
          submitted_at: now,
          status: 'pending',
          created_at: now,
          updated_at: now,
        },
      ];

      mockDataAccessFindAll.mockResolvedValue(mockRequests);

      const response = await request(app).get('/api/data-access-requests');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Data access requests retrieved successfully');
      expect(response.body.data).toEqual(mockRequests);
      expect(response.body.count).toBe(1);
    });
  });

  describe('PUT /api/data-access-requests/:id/fulfill', () => {
    it('should fulfill a data access request', async () => {
      const now = new Date().toISOString();
      const mockFulfilledRequest = {
        id: 'request-1',
        patient_id: 'patient-1',
        request_type: 'data_copy',
        requested_scope: 'All medical records',
        submitted_at: now,
        status: 'fulfilled',
        fulfilled_at: now,
        fulfilled_by: 'test-dpo-id',
        response_document_url: 'https://example.com/document.pdf',
        created_at: now,
        updated_at: now,
      };

      mockDataAccessFulfill.mockResolvedValue(mockFulfilledRequest);
      mockAuditCreate.mockResolvedValue({});

      const response = await request(app)
        .put('/api/data-access-requests/request-1/fulfill')
        .send({
          responseDocumentUrl: 'https://example.com/document.pdf',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Data access request fulfilled successfully');
      expect(response.body.data).toEqual(mockFulfilledRequest);
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'data_access_request_fulfilled',
          resource: 'data_access_request',
        })
      );
    });

    it('should return 404 if request not found', async () => {
      mockDataAccessFulfill.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/data-access-requests/nonexistent/fulfill')
        .send({
          responseDocumentUrl: 'https://example.com/document.pdf',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
    });

    it('should validate request data', async () => {
      const response = await request(app)
        .put('/api/data-access-requests/request-1/fulfill')
        .send({
          responseDocumentUrl: 'invalid-url',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bad Request');
    });
  });

  describe('POST /api/compliance/reports', () => {
    it('should generate a compliance report', async () => {
      mockAuditCreate.mockResolvedValue({});

      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-12-31').toISOString();

      const response = await request(app)
        .post('/api/compliance/reports')
        .send({
          startDate,
          endDate,
          format: 'pdf',
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Compliance report generated successfully');
      expect(response.body.data).toHaveProperty('reportId');
      expect(response.body.data).toHaveProperty('downloadUrl');
      expect(response.body.data.dateRange).toEqual({
        start: startDate,
        end: endDate,
      });
      expect(mockAuditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'compliance_report_generated',
          resource: 'compliance_report',
        })
      );
    });

    it('should validate request data', async () => {
      const response = await request(app)
        .post('/api/compliance/reports')
        .send({
          startDate: 'invalid-date',
          endDate: new Date().toISOString(),
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bad Request');
    });
  });
});
