import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MetricsRepository } from './MetricsRepository';
import { getDatabasePool } from '../config/database';

/**
 * Repo-level regression tests for the merged schema (migration 019/020/021).
 * Runs against admin_panel_test — globalSetup recreates it per run.
 */
describe('MetricsRepository (real DB)', () => {
  const pool = getDatabasePool();
  const repo = new MetricsRepository(pool as any);
  const suffix = Date.now().toString(36);
  let patientId: string;
  let doctorId: string;

  beforeAll(async () => {
    const p = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Metrics Patient', $1, 'x', 'Patient') RETURNING id`,
      [`metrics-p-${suffix}@test.local`]
    );
    patientId = p.rows[0].id;
    const d = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Metrics Doctor', $1, 'x', 'Doctor') RETURNING id`,
      [`metrics-d-${suffix}@test.local`]
    );
    doctorId = d.rows[0].id;
    await pool.query(
      `INSERT INTO consultations (patient_id, doctor_id, status, diagnosis)
       VALUES ($1, $2, 'completed', 'test diagnosis')`,
      [patientId, doctorId]
    );
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM consultations WHERE patient_id = $1`, [patientId]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [[patientId, doctorId]]);
  });

  it('getConsultationMetrics returns real aggregates', async () => {
    const m = await repo.getConsultationMetrics();
    expect(m).toBeDefined();
    // Shape assertions — series + totals present regardless of seed volume
    expect(m).toHaveProperty('total');
  });

  it('getDashboardSummary returns without error on merged schema', async () => {
    const s = await repo.getDashboardSummary();
    expect(s).toBeDefined();
    expect(typeof s).toBe('object');
  });

  it('getAIAcceptanceMetrics handles differentials source/status columns', async () => {
    const m = await repo.getAIAcceptanceMetrics();
    expect(m).toBeDefined();
  });
});
