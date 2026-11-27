import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { getDatabasePool } from '../config/database';

/**
 * E2E clinical workflow — real app, real DB (admin_panel_test), real JWTs.
 * Chain: signup patient/nurse/doctor → seeded intake (chat session + summary)
 * → nurse vitals → doctor context → doctor reasoning → approve → patient encounters.
 */
describe('E2E clinical workflow', () => {
  const pool = getDatabasePool();
  const suffix = Date.now().toString(36);
  const creds = (role: string) => ({
    name: `E2E ${role}`,
    email: `e2e-${role.toLowerCase()}-${suffix}@test.local`,
    password: 'e2e-password-12345',
    role,
  });

  let patient: { token: string; id: string },
    nurse: { token: string; id: string },
    doctor: { token: string; id: string };
  let sessionId: string;
  let reasoningId: string;

  const signup = async (role: string) => {
    const res = await request(app).post('/api/auth/signup').send(creds(role));
    expect(res.status).toBe(201);
    return { token: res.body.data.accessToken, id: res.body.data.user.id };
  };
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    patient = await signup('Patient');
    nurse = await signup('Nurse');
    doctor = await signup('Doctor');

    // Intake completed upstream — seed session + structured summary directly.
    const s = await pool.query(
      `INSERT INTO chat_sessions (patient_id, status) VALUES ($1, 'completed') RETURNING id`,
      [patient.id]
    );
    sessionId = s.rows[0].id;
    await pool.query(
      `INSERT INTO patient_summaries (session_id, patient_id, chief_complaint, symptoms, duration, severity)
       VALUES ($1, $2, 'chest pain', '["chest pain","shortness of breath"]', '2 days', 'moderate')`,
      [sessionId, patient.id]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM vital_signs WHERE patient_id = $1`, [patient.id]);
    await pool.query(`DELETE FROM clinical_reasoning WHERE patient_id = $1`, [patient.id]).catch(() => {});
    await pool.query(`DELETE FROM patient_summaries WHERE session_id = $1`, [sessionId]);
    await pool.query(`DELETE FROM chat_sessions WHERE id = $1`, [sessionId]);
    await pool.query(`DELETE FROM patient_queue WHERE patient_id = $1`, [patient.id]).catch(() => {});
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[patient.id, nurse.id, doctor.id]]);
  });

  it('rejects unauthenticated clinical access', async () => {
    const res = await request(app).get(`/api/doctor/patient/${patient.id}/context`);
    expect([401, 403]).toContain(res.status);
  });

  it('nurse records vitals against the intake session', async () => {
    const res = await request(app)
      .post(`/api/nurse/patient/${patient.id}/vitals`)
      .set(authed(nurse.token))
      .send({
        patientId: patient.id,
        sessionId,
        bloodPressureSystolic: 128,
        bloodPressureDiastolic: 82,
        heartRate: 76,
        temperatureFahrenheit: 98.6,
        oxygenSaturation: 98,
        respiratoryRate: 16,
      });
    expect(res.status).toBeLessThan(300);
    expect(res.status).toBeGreaterThanOrEqual(200);
  });

  it('patient cannot record vitals (role gate)', async () => {
    const res = await request(app)
      .post(`/api/nurse/patient/${patient.id}/vitals`)
      .set(authed(patient.token))
      .send({ patientId: patient.id, sessionId, heartRate: 70 });
    expect(res.status).toBe(403);
  });

  it('doctor retrieves patient clinical context', async () => {
    const res = await request(app)
      .get(`/api/doctor/patient/${patient.id}/context?sessionId=${sessionId}`)
      .set(authed(doctor.token));
    expect(res.status).toBe(200);
  });

  it('doctor saves clinical reasoning', async () => {
    const res = await request(app)
      .post(`/api/doctor/patient/${patient.id}/reasoning`)
      .set(authed(doctor.token))
      .send({
        sessionId,
        differentialDiagnosis: [{ name: 'Stable angina', status: 'accepted' }],
        diagnosticPlan: 'ECG + troponin',
        reasoningRationale: 'Atypical features; rule out ACS first',
        finalNotes: 'E2E test reasoning',
      });
    expect([200, 201]).toContain(res.status);
    reasoningId = res.body.data.reasoningId;
    expect(reasoningId).toBeDefined();
  });

  it('doctor approves reasoning — the authority gate', async () => {
    const res = await request(app)
      .post(`/api/doctor/reasoning/${reasoningId}/approve`)
      .set(authed(doctor.token));
    expect(res.status).toBeLessThan(300);
  });

  it('patient cannot approve reasoning (no clinical authority)', async () => {
    const res = await request(app)
      .post(`/api/doctor/reasoning/${reasoningId}/approve`)
      .set(authed(patient.token));
    expect(res.status).toBe(403);
  });

  it('audit chain verified after workflow writes', async () => {
    const { AuditLogService } = await import('../services/AuditLogService');
    const svc = new AuditLogService(pool);
    const result = await svc.verifyIntegrity();
    expect(result.isValid).toBe(true);
  });
});
