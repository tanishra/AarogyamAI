/**
 * API Contract Tests
 *
 * Pin the HTTP surface of the clinical workflow API: route mounts, status
 * codes, and response envelope shapes ({ message, data } / { error, message }).
 * These tests must keep passing through the refactor — a change here means a
 * breaking API change.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';

// Shared injected user — set per test
let mockUser: { userId: string; email: string; role: string } = {
  userId: 'user-1',
  email: 'test@example.com',
  role: 'Patient',
};

const mockQuery = vi.fn();

vi.mock('../auth/authMiddleware', () => ({
  authenticate: () => (req: any, _res: any, next: any) => {
    req.user = mockUser;
    next();
  },
  optionalAuthenticate: () => (req: any, _res: any, next: any) => {
    req.user = mockUser;
    next();
  },
}));

vi.mock('../auth/authorizationMiddleware', () => ({
  requireAdministrator: () => (_req: any, _res: any, next: any) => next(),
  requireDPO: () => (_req: any, _res: any, next: any) => next(),
  requireAdminOrDPO: () => (_req: any, _res: any, next: any) => next(),
  requireHealthcareProfessional: () => (_req: any, _res: any, next: any) => next(),
  requireAuthenticated: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock('../config/database', () => ({
  query: (...args: any[]) => mockQuery(...args),
  getDatabasePool: () => ({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
  createDatabasePool: () => ({}),
  closeDatabasePool: vi.fn(),
  checkDatabaseHealth: vi.fn(async () => true),
}));

vi.mock('../repositories/AuditLogRepository', () => ({
  AuditLogRepository: vi.fn().mockImplementation(() => ({
    search: vi.fn().mockResolvedValue({ items: [], total: 0, hasMore: false }),
    create: vi.fn().mockResolvedValue({}),
  })),
}));

vi.mock('../repositories/UserRepository', () => ({
  UserRepository: vi.fn().mockImplementation(() => ({
    findByEmail: vi.fn().mockResolvedValue(null),
    findById: vi.fn().mockResolvedValue(null),
  })),
}));

vi.mock('../repositories/ConsentRepository', () => ({
  ConsentRepository: vi.fn().mockImplementation(() => ({
    findByUserId: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../repositories/ChatRepository', () => ({
  chatRepository: {
    getSummary: vi.fn().mockResolvedValue(null),
    updateSummary: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../repositories/VitalsRepository', () => ({
  vitalsRepository: {
    create: vi.fn(),
    getHistory: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('../repositories/ClinicalRepository', () => ({
  clinicalRepository: {
    getById: vi.fn().mockResolvedValue(null),
    update: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock('../services/LLMService', () => ({
  llmService: {
    chat: vi.fn(),
    patientChat: vi.fn(),
    extractPatientSummary: vi.fn(),
    generateClinicalConsiderations: vi.fn(),
    assistClinicalReasoning: vi.fn(),
  },
  LLMService: vi.fn(),
}));

vi.mock('../services/VitalsService', () => ({
  VitalsService: vi.fn().mockImplementation(() => ({
    recordVitals: vi.fn(),
    getVitalsHistory: vi.fn().mockResolvedValue([]),
  })),
}));

vi.mock('../services/CriticalAlertingService', () => ({
  CriticalAlertingService: vi.fn().mockImplementation(() => ({
    getActiveAlerts: vi.fn().mockResolvedValue([]),
    acknowledgeAlert: vi.fn(),
  })),
}));

vi.mock('../services/DifferentialManager', () => ({
  DifferentialManager: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('../services/QuestionnaireSessionManager', () => ({
  QuestionnaireSessionManager: vi.fn().mockImplementation(() => ({
    saveSession: vi.fn().mockResolvedValue('session-id'),
    loadSession: vi.fn().mockResolvedValue(null),
    canResumeSession: vi.fn().mockResolvedValue({ canResume: false }),
  })),
}));

vi.mock('../auth/session', () => ({
  createSession: vi.fn().mockResolvedValue('session-id'),
  invalidateSession: vi.fn().mockResolvedValue(undefined),
  blacklistToken: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(null),
}));

import authRoutes from '../routes/auth';
import nurseRoutes from '../routes/nurseWorkflow';
import doctorRoutes from '../routes/doctorWorkflow';
import patientRoutes from '../routes/patientWorkflow';
import metricsRoutes from '../routes/metrics';
import auditRoutes from '../routes/audit';

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/nurse', nurseRoutes);
  app.use('/api/doctor', doctorRoutes);
  app.use('/api/patient', patientRoutes);
  app.use('/api/metrics', metricsRoutes);
  app.use('/api/audit', auditRoutes);
  return app;
}

describe('API Contracts', () => {
  let app: Express;

  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([]);
    app = buildApp();
  });

  it('POST /api/auth/login returns 400 envelope for invalid body', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request' });
    expect(res.body.message).toBeDefined();
  });

  it('POST /api/auth/login returns 401 envelope for unknown user', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'password123' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: 'Unauthorized' });
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('GET /api/nurse/queue returns 200 with { message, data: { patients, count } }', async () => {
    mockUser = { userId: 'nurse-1', email: 'nurse@test.com', role: 'Nurse' };

    const res = await request(app).get('/api/nurse/queue');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'Nurse queue retrieved',
      data: { patients: [], count: 0 },
    });
  });

  it('GET /api/nurse/queue returns 403 for non-nurse roles', async () => {
    mockUser = { userId: 'patient-1', email: 'patient@test.com', role: 'Patient' };

    const res = await request(app).get('/api/nurse/queue');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('GET /api/doctor/queue returns 200 with { message, data: { patients, count } }', async () => {
    mockUser = { userId: 'doctor-1', email: 'doctor@test.com', role: 'Doctor' };

    const res = await request(app).get('/api/doctor/queue');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'Doctor queue retrieved',
      data: { patients: [], count: 0 },
    });
  });

  it('GET /api/doctor/queue returns 403 for non-doctor roles', async () => {
    mockUser = { userId: 'nurse-1', email: 'nurse@test.com', role: 'Nurse' };

    const res = await request(app).get('/api/doctor/queue');

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: 'Forbidden' });
  });

  it('POST /api/nurse/patient/:id/vitals returns 400 envelope for invalid body', async () => {
    mockUser = { userId: 'nurse-1', email: 'nurse@test.com', role: 'Nurse' };

    const res = await request(app)
      .post('/api/nurse/patient/not-a-uuid/vitals')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request' });
  });

  it('POST /api/doctor/patient/:id/considerations returns 400 envelope for invalid body', async () => {
    mockUser = { userId: 'doctor-1', email: 'doctor@test.com', role: 'Doctor' };

    const res = await request(app)
      .post('/api/doctor/patient/patient-1/considerations')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'Bad Request' });
  });

  it('GET /api/metrics/consultations returns 200 envelope with period', async () => {
    mockUser = { userId: 'admin-1', email: 'admin@test.com', role: 'Administrator' };

    const res = await request(app).get('/api/metrics/consultations');

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Consultation metrics retrieved successfully');
    expect(res.body.data).toBeDefined();
    expect(res.body.period).toBeDefined();
  });

  it('POST /api/audit/verify returns 200 envelope with verification data', async () => {
    mockUser = { userId: 'admin-1', email: 'admin@test.com', role: 'Administrator' };

    const res = await request(app).post('/api/audit/verify').send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'verified' });
    expect(res.body.data.entriesVerified).toBeDefined();
  });
});
