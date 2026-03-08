import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import auditRoutes from './audit';

// Mock the repositories and middleware
vi.mock('../repositories/AuditLogRepository', () => {
  const mockSearch = vi.fn();
  const mockCreate = vi.fn();
  
  return {
    AuditLogRepository: vi.fn().mockImplementation(() => ({
      search: mockSearch,
      create: mockCreate,
    })),
    mockSearch,
    mockCreate,
  };
});

vi.mock('../auth/authMiddleware', () => ({
  authenticate: () => (req: any, _res: any, next: any) => {
    req.user = {
      userId: 'test-admin-id',
      email: 'admin@test.com',
      role: 'Administrator',
    };
    next();
  },
}));

vi.mock('../auth/authorizationMiddleware', () => ({
  requireAdminOrDPO: () => (_req: any, _res: any, next: any) => next(),
}));

describe('Audit Routes', () => {
  let app: Express;
  let mockSearch: any;
  let mockCreate: any;

  beforeEach(async () => {
    // Get the mocked functions
    const { mockSearch: ms, mockCreate: mc } = await import('../repositories/AuditLogRepository');
    mockSearch = ms;
    mockCreate = mc;
    
    // Reset mocks
    mockSearch.mockReset();
    mockCreate.mockReset();
    
    // Setup express app
    app = express();
    app.use(express.json());
    app.use('/api/audit', auditRoutes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/audit/logs', () => {
    it('should return audit logs with pagination', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          userId: 'user-1',
          userName: 'Test User',
          userRole: 'Doctor',
          actionType: 'patient_record_access',
          resource: 'patient',
          resourceId: 'patient-1',
          outcome: 'success',
          timestamp: Date.now(),
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
          requestId: 'req-1',
          hash: 'hash-1',
        },
      ];

      mockSearch.mockResolvedValue({
        items: mockLogs,
        total: 1,
        page: 1,
        limit: 50,
        hasMore: false,
      });

      const response = await request(app)
        .get('/api/audit/logs')
        .query({ page: 1, limit: 50 });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Audit logs retrieved successfully');
      expect(response.body.data).toEqual(mockLogs);
      expect(response.body.pagination).toEqual({
        page: 1,
        limit: 50,
        total: 1,
        hasMore: false,
      });
    });

    it('should filter logs by userId', async () => {
      mockSearch.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 50,
        hasMore: false,
      });

      const testUserId = '550e8400-e29b-41d4-a716-446655440000';
      const response = await request(app)
        .get('/api/audit/logs')
        .query({ userId: testUserId, page: 1, limit: 50 });

      expect(response.status).toBe(200);
      expect(mockSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: testUserId,
        })
      );
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/api/audit/logs')
        .query({ page: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Bad Request');
    });
  });

  describe('GET /api/audit/logs/:id', () => {
    it('should return a single audit log entry', async () => {
      const mockLog = {
        id: 'log-1',
        userId: 'user-1',
        userName: 'Test User',
        userRole: 'Doctor',
        actionType: 'patient_record_access',
        resource: 'patient',
        resourceId: 'patient-1',
        outcome: 'success',
        timestamp: Date.now(),
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent',
        requestId: 'req-1',
        hash: 'hash-1',
      };

      mockSearch.mockResolvedValue({
        items: [mockLog],
        total: 1,
        page: 1,
        limit: 1000,
        hasMore: false,
      });

      const response = await request(app).get('/api/audit/logs/log-1');

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Audit log entry retrieved successfully');
      expect(response.body.data).toEqual(mockLog);
    });

    it('should return 404 if log entry not found', async () => {
      mockSearch.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 1000,
        hasMore: false,
      });

      const response = await request(app).get('/api/audit/logs/nonexistent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Not Found');
    });
  });

  describe('GET /api/audit/access-patterns/:patientId', () => {
    it('should return mock access patterns', async () => {
      const response = await request(app).get('/api/audit/access-patterns/patient-123');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Access patterns retrieved successfully');
      expect(response.body.data).toHaveProperty('patientId', 'patient-123');
      expect(response.body.data).toHaveProperty('accessors');
      expect(response.body.data).toHaveProperty('timeline');
      expect(response.body.note).toContain('placeholder data for MVP');
    });
  });

  describe('GET /api/audit/anomalies', () => {
    it('should return mock anomaly alerts', async () => {
      const response = await request(app).get('/api/audit/anomalies');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('Anomaly alerts retrieved successfully');
      expect(response.body.data).toBeInstanceOf(Array);
      expect(response.body.count).toBeGreaterThanOrEqual(0);
      expect(response.body.note).toContain('placeholder data for MVP');
    });
  });

  describe('POST /api/audit/anomalies/:id/acknowledge', () => {
    it('should acknowledge an anomaly alert', async () => {
      mockCreate.mockResolvedValue({});

      const response = await request(app)
        .post('/api/audit/anomalies/anomaly-1/acknowledge');

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('acknowledged successfully');
      expect(response.body.data).toHaveProperty('acknowledged', true);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'anomaly_acknowledged',
          resource: 'anomaly_alert',
          resourceId: 'anomaly-1',
        })
      );
    });
  });

  describe('POST /api/audit/verify', () => {
    it('should verify audit log integrity', async () => {
      mockCreate.mockResolvedValue({});

      const response = await request(app)
        .post('/api/audit/verify')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('verification completed successfully');
      expect(response.body.data).toHaveProperty('status', 'verified');
      expect(response.body.data).toHaveProperty('entriesVerified');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'audit_log_verification',
        })
      );
    });
  });

  describe('POST /api/audit/export', () => {
    it('should export audit logs', async () => {
      mockCreate.mockResolvedValue({});

      const response = await request(app)
        .post('/api/audit/export')
        .send({
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('export initiated successfully');
      expect(response.body.data).toHaveProperty('exportId');
      expect(response.body.data).toHaveProperty('downloadUrl');
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          actionType: 'audit_log_export',
        })
      );
    });
  });
});
