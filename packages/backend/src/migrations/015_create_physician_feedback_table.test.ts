/**
 * Tests for physician_feedback table migration
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Physician Feedback Table Migration', () => {
  let pool: Pool;
  let testPatientId: string;
  let testPhysicianId: string;
  let testDifferentialId: string;

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
    `, ['test-feedback-patient@example.com', 'hashed_password', 'Patient']);
    testPatientId = patientResult.rows[0].id;

    const physicianResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-feedback-physician@example.com', 'hashed_password', 'Doctor']);
    testPhysicianId = physicianResult.rows[0].id;

    // Create a test differential for foreign key reference
    const differentialResult = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `, [
      '550e8400-e29b-41d4-a716-446655440000',
      testPatientId,
      'J06.9',
      'Acute upper respiratory infection',
      'ai',
      testPhysicianId
    ]);
    testDifferentialId = differentialResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '015_create_physician_feedback_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '015_create_physician_feedback_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test data
    await pool.query('DELETE FROM differentials WHERE id = $1', [testDifferentialId]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2)', [testPatientId, testPhysicianId]);
    
    await pool.end();
  });

  it('should create physician_feedback table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'physician_feedback'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('differential_id');
    expect(columns).toContain('physician_id');
    expect(columns).toContain('rating');
    expect(columns).toContain('categories');
    expect(columns).toContain('free_text');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'physician_feedback';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_physician_feedback_differential_id');
    expect(indexes).toContain('idx_physician_feedback_physician_id');
    expect(indexes).toContain('idx_physician_feedback_rating');
    expect(indexes).toContain('idx_physician_feedback_created_at');
  });

  it('should enforce foreign key constraint on differential_id', async () => {
    // Try to insert with non-existent differential_id
    await expect(
      pool.query(`
        INSERT INTO physician_feedback (
          differential_id, physician_id, rating, categories
        )
        VALUES (
          '00000000-0000-0000-0000-000000000000', 
          $1, 5, ARRAY['accuracy']
        );
      `, [testPhysicianId])
    ).rejects.toThrow();
  });

  it('should enforce foreign key constraint on physician_id', async () => {
    // Try to insert with non-existent physician_id
    await expect(
      pool.query(`
        INSERT INTO physician_feedback (
          differential_id, physician_id, rating, categories
        )
        VALUES (
          $1, '00000000-0000-0000-0000-000000000000', 
          5, ARRAY['accuracy']
        );
      `, [testDifferentialId])
    ).rejects.toThrow();
  });

  it('should enforce rating check constraint (1-5)', async () => {
    // Try to insert with rating > 5
    await expect(
      pool.query(`
        INSERT INTO physician_feedback (
          differential_id, physician_id, rating, categories
        )
        VALUES ($1, $2, 6, ARRAY['accuracy']);
      `, [testDifferentialId, testPhysicianId])
    ).rejects.toThrow();

    // Try to insert with rating < 1
    await expect(
      pool.query(`
        INSERT INTO physician_feedback (
          differential_id, physician_id, rating, categories
        )
        VALUES ($1, $2, 0, ARRAY['accuracy']);
      `, [testDifferentialId, testPhysicianId])
    ).rejects.toThrow();
  });

  it('should enforce categories check constraint with valid values', async () => {
    // Try to insert with invalid category
    await expect(
      pool.query(`
        INSERT INTO physician_feedback (
          differential_id, physician_id, rating, categories
        )
        VALUES ($1, $2, 5, ARRAY['invalid-category']);
      `, [testDifferentialId, testPhysicianId])
    ).rejects.toThrow();
  });

  it('should allow all valid feedback categories', async () => {
    const validCategories = [
      'accuracy',
      'completeness',
      'relevance',
      'clinical-reasoning-quality',
      'missing-diagnosis',
      'incorrect-priority'
    ];

    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id, physician_id, rating, categories
      )
      VALUES ($1, $2, 5, $3)
      RETURNING categories;
    `, [testDifferentialId, testPhysicianId, validCategories]);

    expect(result.rows[0].categories).toEqual(validCategories);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should allow inserting feedback with 5-star rating', async () => {
    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id,
        physician_id,
        rating,
        categories
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, differential_id, physician_id, rating, categories;
    `, [
      testDifferentialId,
      testPhysicianId,
      5,
      ['accuracy', 'completeness']
    ]);

    expect(result.rows[0].differential_id).toBe(testDifferentialId);
    expect(result.rows[0].physician_id).toBe(testPhysicianId);
    expect(result.rows[0].rating).toBe(5);
    expect(result.rows[0].categories).toEqual(['accuracy', 'completeness']);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE id = $1', [result.rows[0].id]);
  });

  it('should allow optional free-text feedback', async () => {
    const freeText = 'The AI did an excellent job identifying the key symptoms and providing relevant differential diagnoses.';
    
    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id,
        physician_id,
        rating,
        categories,
        free_text
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING free_text;
    `, [
      testDifferentialId,
      testPhysicianId,
      5,
      ['accuracy', 'clinical-reasoning-quality'],
      freeText
    ]);

    expect(result.rows[0].free_text).toBe(freeText);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should allow feedback without free-text (optional field)', async () => {
    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id,
        physician_id,
        rating,
        categories
      )
      VALUES ($1, $2, $3, $4)
      RETURNING free_text;
    `, [
      testDifferentialId,
      testPhysicianId,
      4,
      ['relevance']
    ]);

    expect(result.rows[0].free_text).toBeNull();

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should automatically set created_at timestamp', async () => {
    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id, physician_id, rating, categories
      )
      VALUES ($1, $2, $3, $4)
      RETURNING created_at;
    `, [testDifferentialId, testPhysicianId, 5, ['accuracy']]);

    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].created_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should automatically set updated_at timestamp', async () => {
    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id, physician_id, rating, categories
      )
      VALUES ($1, $2, $3, $4)
      RETURNING updated_at;
    `, [testDifferentialId, testPhysicianId, 5, ['accuracy']]);

    expect(result.rows[0].updated_at).not.toBeNull();
    expect(result.rows[0].updated_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support multiple feedback categories', async () => {
    const categories = ['accuracy', 'completeness', 'relevance'];
    
    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id, physician_id, rating, categories
      )
      VALUES ($1, $2, $3, $4)
      RETURNING categories;
    `, [testDifferentialId, testPhysicianId, 4, categories]);

    expect(result.rows[0].categories).toEqual(categories);
    expect(result.rows[0].categories.length).toBe(3);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support single feedback category', async () => {
    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id, physician_id, rating, categories
      )
      VALUES ($1, $2, $3, $4)
      RETURNING categories;
    `, [testDifferentialId, testPhysicianId, 3, ['clinical-reasoning-quality']]);

    expect(result.rows[0].categories).toEqual(['clinical-reasoning-quality']);
    expect(result.rows[0].categories.length).toBe(1);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should allow ratings from 1 to 5', async () => {
    const ratings = [1, 2, 3, 4, 5];
    
    for (const rating of ratings) {
      const result = await pool.query(`
        INSERT INTO physician_feedback (
          differential_id, physician_id, rating, categories
        )
        VALUES ($1, $2, $3, $4)
        RETURNING rating;
      `, [testDifferentialId, testPhysicianId, rating, ['accuracy']]);

      expect(result.rows[0].rating).toBe(rating);
    }

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should query feedback by differential efficiently using index', async () => {
    // Insert multiple feedback entries for the same differential
    await pool.query(`
      INSERT INTO physician_feedback (differential_id, physician_id, rating, categories)
      VALUES 
        ($1, $2, 5, ARRAY['accuracy']),
        ($1, $2, 4, ARRAY['completeness']),
        ($1, $2, 5, ARRAY['relevance']);
    `, [testDifferentialId, testPhysicianId]);

    const result = await pool.query(`
      SELECT rating, categories
      FROM physician_feedback
      WHERE differential_id = $1
      ORDER BY created_at;
    `, [testDifferentialId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].rating).toBe(5);
    expect(result.rows[1].rating).toBe(4);
    expect(result.rows[2].rating).toBe(5);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should query feedback by physician efficiently using index', async () => {
    // Insert feedback from the test physician
    await pool.query(`
      INSERT INTO physician_feedback (differential_id, physician_id, rating, categories)
      VALUES ($1, $2, 5, ARRAY['accuracy']);
    `, [testDifferentialId, testPhysicianId]);

    const result = await pool.query(`
      SELECT physician_id, rating
      FROM physician_feedback
      WHERE physician_id = $1;
    `, [testPhysicianId]);

    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    result.rows.forEach(row => {
      expect(row.physician_id).toBe(testPhysicianId);
    });

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support aggregating feedback scores for admin panel', async () => {
    // Insert multiple feedback entries with different ratings
    await pool.query(`
      INSERT INTO physician_feedback (differential_id, physician_id, rating, categories)
      VALUES 
        ($1, $2, 5, ARRAY['accuracy']),
        ($1, $2, 4, ARRAY['completeness']),
        ($1, $2, 3, ARRAY['relevance']),
        ($1, $2, 5, ARRAY['clinical-reasoning-quality']);
    `, [testDifferentialId, testPhysicianId]);

    // Calculate aggregate rating
    const result = await pool.query(`
      SELECT 
        AVG(rating) as average_rating,
        COUNT(*) as feedback_count,
        MIN(rating) as min_rating,
        MAX(rating) as max_rating
      FROM physician_feedback
      WHERE differential_id = $1;
    `, [testDifferentialId]);

    expect(result.rows[0].feedback_count).toBe('4');
    expect(parseFloat(result.rows[0].average_rating)).toBeCloseTo(4.25, 2);
    expect(result.rows[0].min_rating).toBe(3);
    expect(result.rows[0].max_rating).toBe(5);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should cascade delete feedback when differential is deleted', async () => {
    // Create a temporary differential
    const tempDifferentialResult = await pool.query(`
      INSERT INTO differentials (
        encounter_id, patient_id, diagnosis_code, diagnosis_name, 
        source, added_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id;
    `, [
      '550e8400-e29b-41d4-a716-446655440001',
      testPatientId,
      'J18.9',
      'Pneumonia',
      'ai',
      testPhysicianId
    ]);
    const tempDifferentialId = tempDifferentialResult.rows[0].id;

    // Insert feedback for temp differential
    await pool.query(`
      INSERT INTO physician_feedback (differential_id, physician_id, rating, categories)
      VALUES ($1, $2, $3, $4);
    `, [tempDifferentialId, testPhysicianId, 5, ['accuracy']]);

    // Verify feedback exists
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM physician_feedback
      WHERE differential_id = $1;
    `, [tempDifferentialId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the differential
    await pool.query('DELETE FROM differentials WHERE id = $1', [tempDifferentialId]);

    // Verify feedback was cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM physician_feedback
      WHERE differential_id = $1;
    `, [tempDifferentialId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should cascade delete feedback when physician is deleted', async () => {
    // Create a temporary physician
    const tempPhysicianResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['temp-feedback-physician@example.com', 'hashed_password', 'Doctor']);
    const tempPhysicianId = tempPhysicianResult.rows[0].id;

    // Insert feedback from temp physician
    await pool.query(`
      INSERT INTO physician_feedback (differential_id, physician_id, rating, categories)
      VALUES ($1, $2, $3, $4);
    `, [testDifferentialId, tempPhysicianId, 4, ['completeness']]);

    // Verify feedback exists
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM physician_feedback
      WHERE physician_id = $1;
    `, [tempPhysicianId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the physician
    await pool.query('DELETE FROM users WHERE id = $1', [tempPhysicianId]);

    // Verify feedback was cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM physician_feedback
      WHERE physician_id = $1;
    `, [tempPhysicianId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should track feedback timestamp for audit purposes', async () => {
    const result = await pool.query(`
      INSERT INTO physician_feedback (
        differential_id, physician_id, rating, categories
      )
      VALUES ($1, $2, $3, $4)
      RETURNING created_at, physician_id;
    `, [testDifferentialId, testPhysicianId, 5, ['accuracy']]);

    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].physician_id).toBe(testPhysicianId);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support querying feedback by rating for quality metrics', async () => {
    // Insert feedback with different ratings
    await pool.query(`
      INSERT INTO physician_feedback (differential_id, physician_id, rating, categories)
      VALUES 
        ($1, $2, 5, ARRAY['accuracy']),
        ($1, $2, 5, ARRAY['completeness']),
        ($1, $2, 4, ARRAY['relevance']),
        ($1, $2, 3, ARRAY['clinical-reasoning-quality']);
    `, [testDifferentialId, testPhysicianId]);

    // Query high-rated feedback (4-5 stars)
    const highRatedResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM physician_feedback
      WHERE rating >= 4;
    `);

    expect(parseInt(highRatedResult.rows[0].count)).toBeGreaterThanOrEqual(3);

    // Query low-rated feedback (1-3 stars)
    const lowRatedResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM physician_feedback
      WHERE rating <= 3;
    `);

    expect(parseInt(lowRatedResult.rows[0].count)).toBeGreaterThanOrEqual(1);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support querying feedback by category for analysis', async () => {
    // Insert feedback with different categories
    await pool.query(`
      INSERT INTO physician_feedback (differential_id, physician_id, rating, categories)
      VALUES 
        ($1, $2, 5, ARRAY['accuracy']),
        ($1, $2, 4, ARRAY['accuracy', 'completeness']),
        ($1, $2, 3, ARRAY['relevance']);
    `, [testDifferentialId, testPhysicianId]);

    // Query feedback containing 'accuracy' category
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM physician_feedback
      WHERE 'accuracy' = ANY(categories);
    `);

    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(2);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });

  it('should support time-based queries for trend analysis', async () => {
    // Insert feedback
    await pool.query(`
      INSERT INTO physician_feedback (differential_id, physician_id, rating, categories)
      VALUES ($1, $2, $3, $4);
    `, [testDifferentialId, testPhysicianId, 5, ['accuracy']]);

    // Query recent feedback (last 24 hours)
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM physician_feedback
      WHERE created_at >= NOW() - INTERVAL '24 hours';
    `);

    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1);

    // Clean up
    await pool.query('DELETE FROM physician_feedback WHERE differential_id = $1', [testDifferentialId]);
  });
});
