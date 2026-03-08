/**
 * Tests for critical_alerts table migration
 * Requirements: 29.1, 29.2, 29.3, 29.4, 29.5, 29.6
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Critical Alerts Table Migration', () => {
  let pool: Pool;
  let testPatientId: string;
  let testNurseId: string;
  let testVitalSignId: string;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Create test users for foreign key references
    const patientResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-alerts-patient@example.com', 'hashed_password', 'Patient']);
    testPatientId = patientResult.rows[0].id;

    const nurseResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-alerts-nurse@example.com', 'hashed_password', 'Nurse']);
    testNurseId = nurseResult.rows[0].id;

    // Create a test vital sign record
    const vitalResult = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, systolic_bp, recorded_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id;
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440000', 185, testNurseId]);
    testVitalSignId = vitalResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '018_create_critical_alerts_table.sql'),
      'utf-8'
    );

    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '018_create_critical_alerts_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test data
    await pool.query('DELETE FROM vital_signs WHERE id = $1', [testVitalSignId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testPatientId, testNurseId]);
    
    await pool.end();
  });

  it('should create critical_alerts table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'critical_alerts'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist (Requirements 29.1, 29.2, 29.3, 29.4, 29.5, 29.6)
    expect(columns).toContain('id');
    expect(columns).toContain('vital_sign_id');
    expect(columns).toContain('patient_id');
    expect(columns).toContain('encounter_id');
    expect(columns).toContain('vital_name');
    expect(columns).toContain('vital_value');
    expect(columns).toContain('severity');
    expect(columns).toContain('normal_range');
    expect(columns).toContain('recommended_action');
    expect(columns).toContain('acknowledged');
    expect(columns).toContain('acknowledged_by');
    expect(columns).toContain('acknowledged_at');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'critical_alerts';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_critical_alerts_vital_sign_id');
    expect(indexes).toContain('idx_critical_alerts_patient_id');

    expect(indexes).toContain('idx_critical_alerts_encounter_id');
    expect(indexes).toContain('idx_critical_alerts_acknowledged');
    expect(indexes).toContain('idx_critical_alerts_created_at');
    expect(indexes).toContain('idx_critical_alerts_patient_unack');
  });

  it('should enforce foreign key constraint on vital_sign_id', async () => {
    // Try to insert with non-existent vital_sign_id
    await expect(
      pool.query(`
        INSERT INTO critical_alerts (
          vital_sign_id, patient_id, encounter_id, vital_name, vital_value,
          severity, normal_range, recommended_action
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000', 
          $1,
          '550e8400-e29b-41d4-a716-446655440000',
          'Systolic Blood Pressure',
          '185 mmHg',
          'critical',
          '90-180 mmHg',
          'Recheck blood pressure immediately and notify physician'
        );
      `, [testPatientId])
    ).rejects.toThrow();
  });

  it('should enforce severity constraint', async () => {
    // Try to insert with invalid severity
    await expect(
      pool.query(`
        INSERT INTO critical_alerts (
          vital_sign_id, patient_id, encounter_id, vital_name, vital_value,
          severity, normal_range, recommended_action
        )
        VALUES (
          $1, $2,
          '550e8400-e29b-41d4-a716-446655440000',
          'Systolic Blood Pressure',
          '185 mmHg',
          'invalid_severity',
          '90-180 mmHg',
          'Recheck blood pressure immediately'
        );
      `, [testVitalSignId, testPatientId])
    ).rejects.toThrow();
  });

  it('should create critical alert for high systolic blood pressure', async () => {
  