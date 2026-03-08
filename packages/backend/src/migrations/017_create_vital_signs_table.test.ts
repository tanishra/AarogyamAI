/**
 * Tests for vital_signs table migration
 * Requirements: 28.1, 28.4, 28.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Vital Signs Table Migration', () => {
  let pool: Pool;
  let testPatientId: string;
  let testNurseId: string;

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
    `, ['test-vitals-patient@example.com', 'hashed_password', 'Patient']);
    testPatientId = patientResult.rows[0].id;

    const nurseResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-vitals-nurse@example.com', 'hashed_password', 'Nurse']);
    testNurseId = nurseResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '017_create_vital_signs_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '017_create_vital_signs_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test data
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testPatientId, testNurseId]);
    
    await pool.end();
  });

  it('should create vital_signs table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'vital_signs'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist (Requirement 28.1)
    expect(columns).toContain('id');
    expect(columns).toContain('patient_id');
    expect(columns).toContain('encounter_id');
    expect(columns).toContain('systolic_bp');
    expect(columns).toContain('diastolic_bp');
    expect(columns).toContain('heart_rate');
    expect(columns).toContain('respiratory_rate');
    expect(columns).toContain('temperature');
    expect(columns).toContain('temperature_unit');
    expect(columns).toContain('oxygen_saturation');
    expect(columns).toContain('height');
    expect(columns).toContain('height_unit');
    expect(columns).toContain('weight');
    expect(columns).toContain('weight_unit');
    expect(columns).toContain('bmi');
    expect(columns).toContain('recorded_by');
    expect(columns).toContain('recorded_at');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'vital_signs';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist (Requirements 28.4, 28.5)
    expect(indexes).toContain('idx_vital_signs_patient_id');
    expect(indexes).toContain('idx_vital_signs_encounter_id');
    expect(indexes).toContain('idx_vital_signs_recorded_at');
    expect(indexes).toContain('idx_vital_signs_patient_recorded');
  });

  it('should enforce foreign key constraint on patient_id', async () => {
    // Try to insert with non-existent patient_id
    await expect(
      pool.query(`
        INSERT INTO vital_signs (
          patient_id, encounter_id, recorded_by
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000', 
          '550e8400-e29b-41d4-a716-446655440000',
          $1
        );
      `, [testNurseId])
    ).rejects.toThrow();
  });

  it('should enforce foreign key constraint on recorded_by', async () => {
    // Try to insert with non-existent recorded_by user
    await expect(
      pool.query(`
        INSERT INTO vital_signs (
          patient_id, encounter_id, recorded_by
        )
        VALUES (
          $1,
          '550e8400-e29b-41d4-a716-446655440000',
          '00000000-0000-0000-0000-000000000000'
        );
      `, [testPatientId])
    ).rejects.toThrow();
  });

  it('should allow inserting complete vital signs with all measurements', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, systolic_bp, diastolic_bp,
        heart_rate, respiratory_rate, temperature, temperature_unit,
        oxygen_saturation, height, height_unit, weight, weight_unit,
        bmi, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id, patient_id, systolic_bp, diastolic_bp, heart_rate, bmi;
    `, [
      testPatientId,
      '550e8400-e29b-41d4-a716-446655440000',
      120, // systolic_bp
      80,  // diastolic_bp
      72,  // heart_rate
      16,  // respiratory_rate
      98.6, // temperature
      'F',  // temperature_unit
      98,   // oxygen_saturation
      170,  // height in cm
      'cm', // height_unit
      70,   // weight in kg
      'kg', // weight_unit
      24.2, // bmi
      testNurseId
    ]);

    expect(result.rows[0].patient_id).toBe(testPatientId);
    expect(result.rows[0].systolic_bp).toBe(120);
    expect(result.rows[0].diastolic_bp).toBe(80);
    expect(result.rows[0].heart_rate).toBe(72);
    expect(parseFloat(result.rows[0].bmi)).toBeCloseTo(24.2, 1);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE id = $1', [result.rows[0].id]);
  });

  it('should store BMI calculation field', async () => {
    // Test BMI storage (Requirement 28.1)
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, height, height_unit,
        weight, weight_unit, bmi, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING bmi;
    `, [
      testPatientId,
      '550e8400-e29b-41d4-a716-446655440001',
      175, // height in cm
      'cm',
      80,  // weight in kg
      'kg',
      26.1, // bmi = 80 / (1.75^2)
      testNurseId
    ]);

    expect(parseFloat(result.rows[0].bmi)).toBeCloseTo(26.1, 1);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440001']);
  });

  it('should automatically set recorded_at timestamp', async () => {
    // Test timestamp (Requirement 28.4)
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by
      )
      VALUES ($1, $2, $3)
      RETURNING recorded_at;
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440002', testNurseId]);

    expect(result.rows[0].recorded_at).not.toBeNull();
    expect(result.rows[0].recorded_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440002']);
  });

  it('should automatically set created_at timestamp', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by
      )
      VALUES ($1, $2, $3)
      RETURNING created_at;
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440003', testNurseId]);

    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].created_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440003']);
  });

  it('should automatically set updated_at timestamp', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by
      )
      VALUES ($1, $2, $3)
      RETURNING updated_at;
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440004', testNurseId]);

    expect(result.rows[0].updated_at).not.toBeNull();
    expect(result.rows[0].updated_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440004']);
  });

  it('should cascade delete vitals when patient is deleted', async () => {
    // Create a temporary patient
    const tempPatientResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['temp-vitals-patient@example.com', 'hashed_password', 'Patient']);
    const tempPatientId = tempPatientResult.rows[0].id;

    // Insert vitals for temp patient
    await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by
      )
      VALUES ($1, $2, $3);
    `, [tempPatientId, '550e8400-e29b-41d4-a716-446655440005', testNurseId]);

    // Verify vitals exist
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM vital_signs
      WHERE patient_id = $1;
    `, [tempPatientId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the patient
    await pool.query('DELETE FROM users WHERE id = $1', [tempPatientId]);

    // Verify vitals were cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM vital_signs
      WHERE patient_id = $1;
    `, [tempPatientId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should query vitals by patient efficiently using index', async () => {
    // Test patient_id index (Requirement 28.5)
    await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by
      )
      VALUES ($1, $2, $3);
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440006', testNurseId]);

    const result = await pool.query(`
      SELECT patient_id, encounter_id
      FROM vital_signs
      WHERE patient_id = $1;
    `, [testPatientId]);

    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0].patient_id).toBe(testPatientId);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440006']);
  });

  it('should query vitals by encounter efficiently using index', async () => {
    // Test encounter_id index (Requirement 28.5)
    const encounterId = '550e8400-e29b-41d4-a716-446655440007';
    
    await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by
      )
      VALUES ($1, $2, $3);
    `, [testPatientId, encounterId, testNurseId]);

    const result = await pool.query(`
      SELECT encounter_id
      FROM vital_signs
      WHERE encounter_id = $1;
    `, [encounterId]);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].encounter_id).toBe(encounterId);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE encounter_id = $1', [encounterId]);
  });

  it('should support time-based queries using recorded_at index', async () => {
    // Test recorded_at index (Requirement 28.5)
    await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by
      )
      VALUES ($1, $2, $3);
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440008', testNurseId]);

    // Query recent vitals (last 24 hours)
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM vital_signs
      WHERE recorded_at >= NOW() - INTERVAL '24 hours';
    `);

    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440008']);
  });

  it('should support querying most recent vitals for a patient', async () => {
    // Insert multiple vitals for the same patient
    const encounterId1 = '550e8400-e29b-41d4-a716-446655440009';
    const encounterId2 = '550e8400-e29b-41d4-a716-44665544000a';
    
    await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, recorded_by, recorded_at
      )
      VALUES 
        ($1, $2, $3, NOW() - INTERVAL '2 hours'),
        ($1, $4, $3, NOW() - INTERVAL '1 hour');
    `, [testPatientId, encounterId1, testNurseId, encounterId2]);

    // Query most recent vitals using composite index
    const result = await pool.query(`
      SELECT encounter_id
      FROM vital_signs
      WHERE patient_id = $1
      ORDER BY recorded_at DESC
      LIMIT 1;
    `, [testPatientId]);

    expect(result.rows[0].encounter_id).toBe(encounterId2);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE encounter_id IN ($1, $2)', 
      [encounterId1, encounterId2]);
  });

  it('should store blood pressure measurements', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, systolic_bp, diastolic_bp, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING systolic_bp, diastolic_bp;
    `, [testPatientId, '550e8400-e29b-41d4-a716-44665544000b', 130, 85, testNurseId]);

    expect(result.rows[0].systolic_bp).toBe(130);
    expect(result.rows[0].diastolic_bp).toBe(85);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-44665544000b']);
  });

  it('should store heart rate measurement', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, heart_rate, recorded_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING heart_rate;
    `, [testPatientId, '550e8400-e29b-41d4-a716-44665544000c', 68, testNurseId]);

    expect(result.rows[0].heart_rate).toBe(68);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-44665544000c']);
  });

  it('should store respiratory rate measurement', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, respiratory_rate, recorded_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING respiratory_rate;
    `, [testPatientId, '550e8400-e29b-41d4-a716-44665544000d', 18, testNurseId]);

    expect(result.rows[0].respiratory_rate).toBe(18);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-44665544000d']);
  });

  it('should store temperature with unit', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, temperature, temperature_unit, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING temperature, temperature_unit;
    `, [testPatientId, '550e8400-e29b-41d4-a716-44665544000e', 37.2, 'C', testNurseId]);

    expect(parseFloat(result.rows[0].temperature)).toBeCloseTo(37.2, 1);
    expect(result.rows[0].temperature_unit).toBe('C');

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-44665544000e']);
  });

  it('should enforce temperature unit constraint', async () => {
    // Try to insert with invalid temperature unit
    await expect(
      pool.query(`
        INSERT INTO vital_signs (
          patient_id, encounter_id, temperature, temperature_unit, recorded_by
        )
        VALUES ($1, $2, $3, $4, $5);
      `, [testPatientId, '550e8400-e29b-41d4-a716-44665544000f', 98.6, 'K', testNurseId])
    ).rejects.toThrow();
  });

  it('should store oxygen saturation measurement', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, oxygen_saturation, recorded_by
      )
      VALUES ($1, $2, $3, $4)
      RETURNING oxygen_saturation;
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440010', 97, testNurseId]);

    expect(result.rows[0].oxygen_saturation).toBe(97);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440010']);
  });

  it('should store height with unit', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, height, height_unit, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING height, height_unit;
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440011', 68, 'in', testNurseId]);

    expect(parseFloat(result.rows[0].height)).toBeCloseTo(68, 2);
    expect(result.rows[0].height_unit).toBe('in');

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440011']);
  });

  it('should enforce height unit constraint', async () => {
    // Try to insert with invalid height unit
    await expect(
      pool.query(`
        INSERT INTO vital_signs (
          patient_id, encounter_id, height, height_unit, recorded_by
        )
        VALUES ($1, $2, $3, $4, $5);
      `, [testPatientId, '550e8400-e29b-41d4-a716-446655440012', 170, 'm', testNurseId])
    ).rejects.toThrow();
  });

  it('should store weight with unit', async () => {
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, weight, weight_unit, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING weight, weight_unit;
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440013', 165, 'lb', testNurseId]);

    expect(parseFloat(result.rows[0].weight)).toBeCloseTo(165, 2);
    expect(result.rows[0].weight_unit).toBe('lb');

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440013']);
  });

  it('should enforce weight unit constraint', async () => {
    // Try to insert with invalid weight unit
    await expect(
      pool.query(`
        INSERT INTO vital_signs (
          patient_id, encounter_id, weight, weight_unit, recorded_by
        )
        VALUES ($1, $2, $3, $4, $5);
      `, [testPatientId, '550e8400-e29b-41d4-a716-446655440014', 70, 'g', testNurseId])
    ).rejects.toThrow();
  });

  it('should allow partial vital signs entry', async () => {
    // Only blood pressure and heart rate
    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, systolic_bp, diastolic_bp, heart_rate, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING systolic_bp, diastolic_bp, heart_rate, temperature, oxygen_saturation;
    `, [testPatientId, '550e8400-e29b-41d4-a716-446655440015', 118, 76, 70, testNurseId]);

    expect(result.rows[0].systolic_bp).toBe(118);
    expect(result.rows[0].diastolic_bp).toBe(76);
    expect(result.rows[0].heart_rate).toBe(70);
    expect(result.rows[0].temperature).toBeNull();
    expect(result.rows[0].oxygen_saturation).toBeNull();

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE patient_id = $1 AND encounter_id = $2', 
      [testPatientId, '550e8400-e29b-41d4-a716-446655440015']);
  });

  it('should support comprehensive vital signs record', async () => {
    const comprehensiveVitals = {
      patient_id: testPatientId,
      encounter_id: '550e8400-e29b-41d4-a716-446655440016',
      systolic_bp: 125,
      diastolic_bp: 82,
      heart_rate: 75,
      respiratory_rate: 14,
      temperature: 98.4,
      temperature_unit: 'F',
      oxygen_saturation: 99,
      height: 172,
      height_unit: 'cm',
      weight: 75,
      weight_unit: 'kg',
      bmi: 25.3,
      recorded_by: testNurseId
    };

    const result = await pool.query(`
      INSERT INTO vital_signs (
        patient_id, encounter_id, systolic_bp, diastolic_bp,
        heart_rate, respiratory_rate, temperature, temperature_unit,
        oxygen_saturation, height, height_unit, weight, weight_unit,
        bmi, recorded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `, [
      comprehensiveVitals.patient_id,
      comprehensiveVitals.encounter_id,
      comprehensiveVitals.systolic_bp,
      comprehensiveVitals.diastolic_bp,
      comprehensiveVitals.heart_rate,
      comprehensiveVitals.respiratory_rate,
      comprehensiveVitals.temperature,
      comprehensiveVitals.temperature_unit,
      comprehensiveVitals.oxygen_saturation,
      comprehensiveVitals.height,
      comprehensiveVitals.height_unit,
      comprehensiveVitals.weight,
      comprehensiveVitals.weight_unit,
      comprehensiveVitals.bmi,
      comprehensiveVitals.recorded_by
    ]);

    expect(result.rows[0].systolic_bp).toBe(125);
    expect(result.rows[0].diastolic_bp).toBe(82);
    expect(result.rows[0].heart_rate).toBe(75);
    expect(result.rows[0].respiratory_rate).toBe(14);
    expect(parseFloat(result.rows[0].temperature)).toBeCloseTo(98.4, 1);
    expect(result.rows[0].temperature_unit).toBe('F');
    expect(result.rows[0].oxygen_saturation).toBe(99);
    expect(parseFloat(result.rows[0].height)).toBeCloseTo(172, 2);
    expect(result.rows[0].height_unit).toBe('cm');
    expect(parseFloat(result.rows[0].weight)).toBeCloseTo(75, 2);
    expect(result.rows[0].weight_unit).toBe('kg');
    expect(parseFloat(result.rows[0].bmi)).toBeCloseTo(25.3, 1);
    expect(result.rows[0].recorded_by).toBe(testNurseId);

    // Clean up
    await pool.query('DELETE FROM vital_signs WHERE id = $1', [result.rows[0].id]);
  });
});
