/**
 * Tests for differentials table migration
 * Requirements: 8.3, 8.8
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Differentials Table Migration', () => {
  let pool: Pool;
  let testPatientId: string;
  let testPhysicianId: string;

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
    `, ['test-differential-patient@example.com', 'hashed_password', 'Patient']);
    testPatientId = patientResult.rows[0].id;

    const physicianResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-differential-physician@example.com', 'hashed_password', 'Doctor']);
    testPhysicianId = physicianResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '013_create_differentials_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '013_create_differentials_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test users
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testPatientId, testPhysicianId]);
    
    await pool.end();
  });

  it('should create differentials table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'differentials'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('encounter_id');
    expect(columns).toContain('patient_id');
    expect(columns).toContain('diagnosis_code');
    expect(columns).toContain('diagnosis_name');
    expect(columns).toContain('diagnosis_category');
    expect(columns).toContain('priority');
    expect(columns).toContain('supporting_evidence');
    expect(columns).toContain('clinical_reasoning');
    expect(columns).toContain('confidence');
    expect(columns).toContain('source');
    expect(columns).toContain('added_by');
    expect(columns).toContain('added_at');
    expect(columns).toContain('modified_at');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'differentials';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_differentials_encounter_id');
    expect(indexes).toContain('idx_differentials_patient_id');
    expect(indexes).toContain('idx_differentials_source');
    expect(indexes).toContain('idx_differentials_added_by');
    expect(indexes).toContain('idx_differentials_priority');
  });

  it('should enforce foreign key constraint on patient_id', async () => {
    // Try to insert with non-existent patient_id
    await expect(
      pool.query(`
        INSERT INTO differentials (
          encounter_id, patient_id, diagnosis_code, diagnosis_name, 
          source, added_by
        )
        VALUES (
          gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 
          'J00', 'Common Cold', 'ai', $1
        );
      `, [testPhysicianId])
    ).rejects.toThrow();
  });

  it('should enforce foreign key constraint on added_by', async () => {
    // Try to insert with non-existent added_by user
    await expect(
      pool.query(`
        INSERT INTO differentials (
          encounter_id, patient_id, diagnosis_code, diagnosis_name, 
          source, added_by
        )
        VALUES (
          gen_random_uuid(), $1, 'J00', 'Common Cold', 
          'ai', '00000000-0000-0000-0000-000000000000'
        );
      `, [testPatientId])
    ).rejects.toThrow();
  });

  it('should enforce source check constraint', async () => {
    // Try to insert with invalid source
    await expect(
      pool.query(`
        INSERT INTO differentials (
          encounter_id, patient_id, diagnosis_code, diagnosis_name, 
          source, added_by
        )
        VALUES (
          gen_random_uuid(), $1, 'J00', 'Common Cold', 
          'invalid_source', $2
        );
      `, [testPatientId, testPhysicianId])
    ).rejects.toThrow();
  });

  it('should enforce confidence check constraint (0-100)', async () => {
    // Try to insert with confidence > 100
    await expect(
      pool.query(`
        INSERT INTO differentials (
          encounter_id, patient_id, diagnosis_code, diagnosis_name, 
          source, added_by, confidence
        )
        VALUES (
          gen_random_uuid(), $1, 'J00', 'Common Cold', 
          'ai', $2, 150
        );
      `, [testPatientId, testPhysicianId])
    ).rejects.toThrow();

    // Try to insert with confidence < 0
    await expect(
      pool.query(`
        INSERT INTO differentials (
          encounter_id, patient_id, diagnosis_code, diagnosis_name, 
          source, added_by, confidence
        )
        VALUES (
          gen_random_uuid(), $1, 'J00', 'Common Cold', 
          'ai', $2, -10
        );
      `, [testPatientId, testPhysicianId])
    ).rejects.toThrow();
  });

  it('should allow inserting a valid AI-generated differential', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440000';
    const result = await pool.query(`
      INSERT INTO differentials (
        encounter_id,
        patient_id,
        diagnosis_code,
        diagnosis_name,
        diagnosis_category,
        priority,
        supporting_evidence,
        clinical_reasoning,
        confidence,
        source,
        added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, encounter_id, patient_id, diagnosis_code, diagnosis_name, 
                source, added_by, confidence, priority;
    `, [
      encounterId,
      testPatientId,
      'J06.9',
      'Acute upper respiratory infection',
      'Infectious',
      1,
      JSON.stringify([
        { type: 'symptom', description: 'Cough', weight: 'strong', source: 'patient_report' },
        { type: 'symptom', description: 'Fever', weight: 'moderate', source: 'patient_report' }
      ]),
      'Patient presents with classic URI symptoms including cough and fever',
      85,
      'ai',
      testPhysicianId
    ]);

    expect(result.rows[0].encounter_id).toBe(encounterId);
    expect(result.rows[0].patient_id).toBe(testPatientId);
    expect(result.rows[0].diagnosis_code).toBe('J06.9');
    expect(result.rows[0].diagnosis_name).toBe('Acute upper respiratory infection');
    expect(result.rows[0].source).toBe('ai');
    expect(result.rows[0].added_by).toBe(testPhysicianId);
    expect(result.rows[0].confidence).toBe(85);
    expect(result.rows[0].priority).toBe(1);

    // Clean up
    await pool.query('DELETE FROM differentials WHERE id = $1', [result.rows[0].id]);
  });

  it('should allow inserting a valid physician-added differential', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440001';
    const result = await pool.query(`
      INSERT INTO differentials (
        encounter_id,
        patient_id,
        diagnosis_code,
        diagnosis_name,
        diagnosis_category,
        priority,
        clinical_reasoning,
        source,
        added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, source, added_by;
    `, [
      encounterId,
      testPatientId,
      'I10',
      'Essential hypertension',
      'Cardiovascular',
      2,
      'Patient has elevated BP readings and family history',
      'physician',
      testPhysicianId
    ]);

    expect(result.rows[0].source).toBe('physician');
    expect(result.rows[0].added_by).toBe(testPhysicianId);

    // Clean up
    await pool.query('DELETE FROM differentials WHERE id = $1', [result.rows[0].id]);
  });

  it('should allow both ai and physician source values', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440002';
    
    // Insert AI differential
    const aiResult = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING source;
    `, [encounterId, testPatientId, 'J00', 'Common Cold', 'ai', testPhysicianId]);
    expect(aiResult.rows[0].source).toBe('ai');

    // Insert physician differential
    const physicianResult = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING source;
    `, [encounterId, testPatientId, 'I10', 'Hypertension', 'physician', testPhysicianId]);
    expect(physicianResult.rows[0].source).toBe('physician');

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should default priority to 1', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440003';
    const result = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING priority;
    `, [encounterId, testPatientId, 'J00', 'Common Cold', 'ai', testPhysicianId]);

    expect(result.rows[0].priority).toBe(1);

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should automatically set added_at timestamp', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440004';
    const result = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING added_at;
    `, [encounterId, testPatientId, 'J00', 'Common Cold', 'ai', testPhysicianId]);

    expect(result.rows[0].added_at).not.toBeNull();
    expect(result.rows[0].added_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should automatically set created_at and updated_at timestamps', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440005';
    const result = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING created_at, updated_at;
    `, [encounterId, testPatientId, 'J00', 'Common Cold', 'ai', testPhysicianId]);

    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].updated_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should update modified_at when diagnosis is modified', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440006';
    
    // Insert differential
    const insertResult = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by, clinical_reasoning
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, modified_at;
    `, [encounterId, testPatientId, 'J00', 'Common Cold', 'ai', testPhysicianId, 'Initial reasoning']);

    expect(insertResult.rows[0].modified_at).toBeNull();

    // Wait a moment to ensure timestamp difference
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update clinical reasoning
    const updateResult = await pool.query(`
      UPDATE differentials
      SET clinical_reasoning = 'Updated reasoning'
      WHERE id = $1
      RETURNING modified_at;
    `, [insertResult.rows[0].id]);

    expect(updateResult.rows[0].modified_at).not.toBeNull();
    expect(updateResult.rows[0].modified_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM differentials WHERE id = $1', [insertResult.rows[0].id]);
  });

  it('should not update modified_at when non-content fields are updated', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440007';
    
    // Insert differential
    const insertResult = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, modified_at;
    `, [encounterId, testPatientId, 'J00', 'Common Cold', 'ai', testPhysicianId]);

    expect(insertResult.rows[0].modified_at).toBeNull();

    // Update only updated_at (non-content field)
    const updateResult = await pool.query(`
      UPDATE differentials
      SET updated_at = NOW()
      WHERE id = $1
      RETURNING modified_at;
    `, [insertResult.rows[0].id]);

    // modified_at should still be NULL since no content was changed
    expect(updateResult.rows[0].modified_at).toBeNull();

    // Clean up
    await pool.query('DELETE FROM differentials WHERE id = $1', [insertResult.rows[0].id]);
  });

  it('should store supporting evidence as JSONB', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440008';
    const evidence = [
      { type: 'symptom', description: 'Persistent cough', weight: 'strong', source: 'patient_report' },
      { type: 'sign', description: 'Elevated temperature', weight: 'moderate', source: 'vitals' },
      { type: 'lab', description: 'Elevated WBC', weight: 'strong', source: 'lab_results' }
    ];

    const result = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by, supporting_evidence
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING supporting_evidence;
    `, [encounterId, testPatientId, 'J18.9', 'Pneumonia', 'ai', testPhysicianId, JSON.stringify(evidence)]);

    expect(result.rows[0].supporting_evidence).toEqual(evidence);

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should query differentials by encounter efficiently using index', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440009';
    
    // Insert multiple differentials for the same encounter
    await pool.query(`
      INSERT INTO differentials (encounter_id, patient_id, diagnosis_code, diagnosis_name, source, added_by, priority)
      VALUES 
        ($1, $2, 'J06.9', 'URI', 'ai', $3, 1),
        ($1, $2, 'J18.9', 'Pneumonia', 'ai', $3, 2),
        ($1, $2, 'I10', 'Hypertension', 'physician', $3, 3);
    `, [encounterId, testPatientId, testPhysicianId]);

    const result = await pool.query(`
      SELECT diagnosis_code, diagnosis_name, source, priority
      FROM differentials
      WHERE encounter_id = $1
      ORDER BY priority;
    `, [encounterId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].diagnosis_code).toBe('J06.9');
    expect(result.rows[1].diagnosis_code).toBe('J18.9');
    expect(result.rows[2].diagnosis_code).toBe('I10');

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should query differentials by source efficiently using index', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440010';
    
    // Insert differentials with different sources
    await pool.query(`
      INSERT INTO differentials (encounter_id, patient_id, diagnosis_code, diagnosis_name, source, added_by)
      VALUES 
        ($1, $2, 'J06.9', 'URI', 'ai', $3),
        ($1, $2, 'J18.9', 'Pneumonia', 'ai', $3),
        ($1, $2, 'I10', 'Hypertension', 'physician', $3);
    `, [encounterId, testPatientId, testPhysicianId]);

    // Query only AI-generated differentials
    const aiResult = await pool.query(`
      SELECT diagnosis_code, source
      FROM differentials
      WHERE encounter_id = $1 AND source = 'ai'
      ORDER BY created_at;
    `, [encounterId]);

    expect(aiResult.rows.length).toBe(2);
    expect(aiResult.rows[0].diagnosis_code).toBe('J06.9');
    expect(aiResult.rows[1].diagnosis_code).toBe('J18.9');
    aiResult.rows.forEach(row => expect(row.source).toBe('ai'));

    // Query only physician-added differentials
    const physicianResult = await pool.query(`
      SELECT diagnosis_code, source
      FROM differentials
      WHERE encounter_id = $1 AND source = 'physician'
      ORDER BY created_at;
    `, [encounterId]);

    expect(physicianResult.rows.length).toBe(1);
    expect(physicianResult.rows[0].diagnosis_code).toBe('I10');
    expect(physicianResult.rows[0].source).toBe('physician');

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should cascade delete differentials when patient is deleted', async () => {
    // Create a temporary test user
    const tempUserResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['temp-differential-patient@example.com', 'hashed_password', 'Patient']);
    const tempUserId = tempUserResult.rows[0].id;

    const encounterId = '550e8400-e29b-41d4-a716-446655440011';

    // Insert differential for temp user
    await pool.query(`
      INSERT INTO differentials (encounter_id, patient_id, diagnosis_code, diagnosis_name, source, added_by)
      VALUES ($1, $2, $3, $4, $5, $6);
    `, [encounterId, tempUserId, 'J00', 'Common Cold', 'ai', testPhysicianId]);

    // Verify differential exists
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM differentials
      WHERE patient_id = $1;
    `, [tempUserId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [tempUserId]);

    // Verify differential was cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM differentials
      WHERE patient_id = $1;
    `, [tempUserId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should support physician-added diagnoses with distinct visual indicator data', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440012';
    
    // Insert both AI and physician differentials
    await pool.query(`
      INSERT INTO differentials (encounter_id, patient_id, diagnosis_code, diagnosis_name, source, added_by)
      VALUES 
        ($1, $2, 'J06.9', 'URI', 'ai', $3),
        ($1, $2, 'I10', 'Hypertension', 'physician', $3);
    `, [encounterId, testPatientId, testPhysicianId]);

    // Query all differentials with source for visual indicator
    const result = await pool.query(`
      SELECT diagnosis_code, diagnosis_name, source, added_by
      FROM differentials
      WHERE encounter_id = $1
      ORDER BY created_at;
    `, [encounterId]);

    expect(result.rows.length).toBe(2);
    
    // Verify AI differential
    expect(result.rows[0].source).toBe('ai');
    expect(result.rows[0].diagnosis_code).toBe('J06.9');
    
    // Verify physician differential (Requirement 8.8: distinct visual indicator)
    expect(result.rows[1].source).toBe('physician');
    expect(result.rows[1].diagnosis_code).toBe('I10');
    expect(result.rows[1].added_by).toBe(testPhysicianId);

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should track who added each diagnosis for audit purposes', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440013';
    
    const result = await pool.query(`
      INSERT INTO differentials (encounter_id, patient_id, diagnosis_code, diagnosis_name, source, added_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING added_by, added_at;
    `, [encounterId, testPatientId, 'I10', 'Hypertension', 'physician', testPhysicianId]);

    expect(result.rows[0].added_by).toBe(testPhysicianId);
    expect(result.rows[0].added_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });

  it('should support reordering differentials by priority', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440014';
    
    // Insert differentials with different priorities
    await pool.query(`
      INSERT INTO differentials (encounter_id, patient_id, diagnosis_code, diagnosis_name, source, added_by, priority)
      VALUES 
        ($1, $2, 'J06.9', 'URI', 'ai', $3, 3),
        ($1, $2, 'J18.9', 'Pneumonia', 'ai', $3, 1),
        ($1, $2, 'I10', 'Hypertension', 'physician', $3, 2);
    `, [encounterId, testPatientId, testPhysicianId]);

    // Query ordered by priority
    const result = await pool.query(`
      SELECT diagnosis_code, priority
      FROM differentials
      WHERE encounter_id = $1
      ORDER BY priority;
    `, [encounterId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].diagnosis_code).toBe('J18.9');
    expect(result.rows[0].priority).toBe(1);
    expect(result.rows[1].diagnosis_code).toBe('I10');
    expect(result.rows[1].priority).toBe(2);
    expect(result.rows[2].diagnosis_code).toBe('J06.9');
    expect(result.rows[2].priority).toBe(3);

    // Clean up
    await pool.query('DELETE FROM differentials WHERE encounter_id = $1', [encounterId]);
  });
});
