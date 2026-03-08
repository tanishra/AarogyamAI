/**
 * Tests for clinical_reasoning_versions table migration
 * Requirements: 12.1, 12.4, 12.7
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Clinical Reasoning Versions Table Migration', () => {
  let pool: Pool;
  let testUserId: string;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Create test user for foreign key references
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-version-user@example.com', 'hashed_password', 'Doctor']);
    testUserId = userResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '014_create_clinical_reasoning_versions_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '014_create_clinical_reasoning_versions_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test user
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    
    await pool.end();
  });

  it('should create clinical_reasoning_versions table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'clinical_reasoning_versions'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('encounter_id');
    expect(columns).toContain('version_number');
    expect(columns).toContain('user_id');
    expect(columns).toContain('user_name');
    expect(columns).toContain('user_role');
    expect(columns).toContain('change_type');
    expect(columns).toContain('change_summary');
    expect(columns).toContain('snapshot');
    expect(columns).toContain('created_at');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'clinical_reasoning_versions';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_cr_versions_encounter_id');
    expect(indexes).toContain('idx_cr_versions_created_at');
    expect(indexes).toContain('idx_cr_versions_user_id');
  });

  it('should enforce foreign key constraint on user_id', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440000';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    // Try to insert with non-existent user_id
    await expect(
      pool.query(`
        INSERT INTO clinical_reasoning_versions (
          encounter_id, version_number, user_id, user_name, user_role,
          change_type, change_summary, snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `, [
        encounterId, 1, '00000000-0000-0000-0000-000000000000',
        'Test User', 'Doctor', 'differential-added', 'Added diagnosis',
        JSON.stringify(snapshot)
      ])
    ).rejects.toThrow();
  });

  it('should enforce unique constraint on (encounter_id, version_number)', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440001';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    // Insert first version
    await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `, [
      encounterId, 1, testUserId, 'Dr. Test', 'Doctor',
      'differential-added', 'Added first diagnosis', JSON.stringify(snapshot)
    ]);

    // Try to insert duplicate version number for same encounter
    await expect(
      pool.query(`
        INSERT INTO clinical_reasoning_versions (
          encounter_id, version_number, user_id, user_name, user_role,
          change_type, change_summary, snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `, [
        encounterId, 1, testUserId, 'Dr. Test', 'Doctor',
        'differential-modified', 'Modified diagnosis', JSON.stringify(snapshot)
      ])
    ).rejects.toThrow();

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should enforce change_type check constraint', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440002';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    // Try to insert with invalid change_type
    await expect(
      pool.query(`
        INSERT INTO clinical_reasoning_versions (
          encounter_id, version_number, user_id, user_name, user_role,
          change_type, change_summary, snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `, [
        encounterId, 1, testUserId, 'Dr. Test', 'Doctor',
        'invalid-change-type', 'Invalid change', JSON.stringify(snapshot)
      ])
    ).rejects.toThrow();
  });

  it('should allow all valid change_type values', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440003';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    const validChangeTypes = [
      'differential-added',
      'differential-removed',
      'differential-modified',
      'differential-reordered',
      'reasoning-updated',
      'evidence-added',
      'evidence-removed'
    ];

    for (let i = 0; i < validChangeTypes.length; i++) {
      const result = await pool.query(`
        INSERT INTO clinical_reasoning_versions (
          encounter_id, version_number, user_id, user_name, user_role,
          change_type, change_summary, snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING change_type;
      `, [
        encounterId, i + 1, testUserId, 'Dr. Test', 'Doctor',
        validChangeTypes[i], `Test ${validChangeTypes[i]}`, JSON.stringify(snapshot)
      ]);

      expect(result.rows[0].change_type).toBe(validChangeTypes[i]);
    }

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should automatically set created_at timestamp', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440004';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    const result = await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING created_at;
    `, [
      encounterId, 1, testUserId, 'Dr. Test', 'Doctor',
      'differential-added', 'Added diagnosis', JSON.stringify(snapshot)
    ]);

    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].created_at).toBeInstanceOf(Date);

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should store complete snapshot in JSONB format', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440005';
    const snapshot = {
      differentials: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          diagnosis: {
            code: 'J06.9',
            name: 'Acute upper respiratory infection',
            category: 'Infectious'
          },
          priority: 1,
          supportingEvidence: [
            { type: 'symptom', description: 'Cough', weight: 'strong' },
            { type: 'symptom', description: 'Fever', weight: 'moderate' }
          ],
          clinicalReasoning: 'Patient presents with classic URI symptoms',
          confidence: 85,
          source: 'ai'
        }
      ],
      clinicalSummary: 'Patient with acute respiratory symptoms',
      assessmentAndPlan: 'Supportive care and monitoring'
    };

    const result = await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING snapshot;
    `, [
      encounterId, 1, testUserId, 'Dr. Test', 'Doctor',
      'differential-added', 'Added URI diagnosis', JSON.stringify(snapshot)
    ]);

    expect(result.rows[0].snapshot).toEqual(snapshot);
    expect(result.rows[0].snapshot.differentials).toHaveLength(1);
    expect(result.rows[0].snapshot.differentials[0].diagnosis.code).toBe('J06.9');

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should create sequential versions for the same encounter', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440006';
    const baseSnapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    // Insert version 1
    await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `, [
      encounterId, 1, testUserId, 'Dr. Test', 'Doctor',
      'differential-added', 'Added first diagnosis', JSON.stringify(baseSnapshot)
    ]);

    // Insert version 2
    await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `, [
      encounterId, 2, testUserId, 'Dr. Test', 'Doctor',
      'differential-modified', 'Modified diagnosis', JSON.stringify(baseSnapshot)
    ]);

    // Insert version 3
    await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
    `, [
      encounterId, 3, testUserId, 'Dr. Test', 'Doctor',
      'differential-reordered', 'Reordered diagnoses', JSON.stringify(baseSnapshot)
    ]);

    // Query all versions
    const result = await pool.query(`
      SELECT version_number, change_type, change_summary
      FROM clinical_reasoning_versions
      WHERE encounter_id = $1
      ORDER BY version_number;
    `, [encounterId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].version_number).toBe(1);
    expect(result.rows[0].change_type).toBe('differential-added');
    expect(result.rows[1].version_number).toBe(2);
    expect(result.rows[1].change_type).toBe('differential-modified');
    expect(result.rows[2].version_number).toBe(3);
    expect(result.rows[2].change_type).toBe('differential-reordered');

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should store user information for audit trail', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440007';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    const result = await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING user_id, user_name, user_role, created_at;
    `, [
      encounterId, 1, testUserId, 'Dr. Jane Smith', 'Physician',
      'differential-added', 'Added diagnosis', JSON.stringify(snapshot)
    ]);

    expect(result.rows[0].user_id).toBe(testUserId);
    expect(result.rows[0].user_name).toBe('Dr. Jane Smith');
    expect(result.rows[0].user_role).toBe('Physician');
    expect(result.rows[0].created_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should query version history chronologically using index', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440008';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    // Insert multiple versions with slight delays
    for (let i = 1; i <= 3; i++) {
      await pool.query(`
        INSERT INTO clinical_reasoning_versions (
          encounter_id, version_number, user_id, user_name, user_role,
          change_type, change_summary, snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `, [
        encounterId, i, testUserId, 'Dr. Test', 'Doctor',
        'differential-added', `Version ${i}`, JSON.stringify(snapshot)
      ]);
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    // Query by created_at (should use index)
    const result = await pool.query(`
      SELECT version_number, change_summary, created_at
      FROM clinical_reasoning_versions
      WHERE encounter_id = $1
      ORDER BY created_at DESC;
    `, [encounterId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].version_number).toBe(3);
    expect(result.rows[1].version_number).toBe(2);
    expect(result.rows[2].version_number).toBe(1);

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should query all versions for an encounter efficiently using index', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440009';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    // Insert versions for this encounter
    await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES 
        ($1, 1, $2, 'Dr. Test', 'Doctor', 'differential-added', 'Version 1', $3),
        ($1, 2, $2, 'Dr. Test', 'Doctor', 'differential-modified', 'Version 2', $3),
        ($1, 3, $2, 'Dr. Test', 'Doctor', 'differential-reordered', 'Version 3', $3);
    `, [encounterId, testUserId, JSON.stringify(snapshot)]);

    // Query all versions (should use idx_cr_versions_encounter_id)
    const result = await pool.query(`
      SELECT version_number, change_type, change_summary
      FROM clinical_reasoning_versions
      WHERE encounter_id = $1
      ORDER BY version_number;
    `, [encounterId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].version_number).toBe(1);
    expect(result.rows[1].version_number).toBe(2);
    expect(result.rows[2].version_number).toBe(3);

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should query versions by user efficiently using index', async () => {
    const encounterId1 = '550e8400-e29b-41d4-a716-446655440010';
    const encounterId2 = '550e8400-e29b-41d4-a716-446655440011';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    // Insert versions for different encounters by same user
    await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES 
        ($1, 1, $3, 'Dr. Test', 'Doctor', 'differential-added', 'Encounter 1 Version 1', $4),
        ($2, 1, $3, 'Dr. Test', 'Doctor', 'differential-added', 'Encounter 2 Version 1', $4);
    `, [encounterId1, encounterId2, testUserId, JSON.stringify(snapshot)]);

    // Query by user_id (should use idx_cr_versions_user_id)
    const result = await pool.query(`
      SELECT encounter_id, version_number, change_summary
      FROM clinical_reasoning_versions
      WHERE user_id = $1
      ORDER BY created_at;
    `, [testUserId]);

    expect(result.rows.length).toBeGreaterThanOrEqual(2);
    const relevantRows = result.rows.filter(
      row => row.encounter_id === encounterId1 || row.encounter_id === encounterId2
    );
    expect(relevantRows.length).toBe(2);

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id IN ($1, $2)', 
      [encounterId1, encounterId2]);
  });

  it('should support version comparison by retrieving specific versions', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440012';
    const snapshot1 = {
      differentials: [
        { diagnosis: { code: 'J06.9', name: 'URI' }, priority: 1 }
      ],
      clinicalSummary: 'Initial assessment',
      assessmentAndPlan: 'Monitor symptoms'
    };
    const snapshot2 = {
      differentials: [
        { diagnosis: { code: 'J06.9', name: 'URI' }, priority: 1 },
        { diagnosis: { code: 'J18.9', name: 'Pneumonia' }, priority: 2 }
      ],
      clinicalSummary: 'Updated assessment',
      assessmentAndPlan: 'Consider antibiotics'
    };

    // Insert two versions
    await pool.query(`
      INSERT INTO clinical_reasoning_versions (
        encounter_id, version_number, user_id, user_name, user_role,
        change_type, change_summary, snapshot
      )
      VALUES 
        ($1, 1, $2, 'Dr. Test', 'Doctor', 'differential-added', 'Initial diagnosis', $3),
        ($1, 2, $2, 'Dr. Test', 'Doctor', 'differential-added', 'Added pneumonia', $4);
    `, [encounterId, testUserId, JSON.stringify(snapshot1), JSON.stringify(snapshot2)]);

    // Retrieve both versions for comparison
    const result = await pool.query(`
      SELECT version_number, snapshot
      FROM clinical_reasoning_versions
      WHERE encounter_id = $1
      ORDER BY version_number;
    `, [encounterId]);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].snapshot.differentials).toHaveLength(1);
    expect(result.rows[1].snapshot.differentials).toHaveLength(2);
    expect(result.rows[1].snapshot.differentials[1].diagnosis.code).toBe('J18.9');

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should retain all versions per retention policy', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440013';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    // Insert multiple versions
    for (let i = 1; i <= 5; i++) {
      await pool.query(`
        INSERT INTO clinical_reasoning_versions (
          encounter_id, version_number, user_id, user_name, user_role,
          change_type, change_summary, snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `, [
        encounterId, i, testUserId, 'Dr. Test', 'Doctor',
        'differential-modified', `Version ${i}`, JSON.stringify(snapshot)
      ]);
    }

    // Verify all versions are retained
    const result = await pool.query(`
      SELECT COUNT(*) as count
      FROM clinical_reasoning_versions
      WHERE encounter_id = $1;
    `, [encounterId]);

    expect(parseInt(result.rows[0].count)).toBe(5);

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });

  it('should support different change types for comprehensive tracking', async () => {
    const encounterId = '550e8400-e29b-41d4-a716-446655440014';
    const snapshot = {
      differentials: [],
      clinicalSummary: 'Test summary',
      assessmentAndPlan: 'Test plan'
    };

    const changes = [
      { type: 'differential-added', summary: 'Added new diagnosis' },
      { type: 'evidence-added', summary: 'Added supporting evidence' },
      { type: 'reasoning-updated', summary: 'Updated clinical reasoning' },
      { type: 'differential-reordered', summary: 'Changed priority order' },
      { type: 'differential-modified', summary: 'Modified diagnosis details' },
      { type: 'evidence-removed', summary: 'Removed outdated evidence' },
      { type: 'differential-removed', summary: 'Removed incorrect diagnosis' }
    ];

    // Insert versions with different change types
    for (let i = 0; i < changes.length; i++) {
      await pool.query(`
        INSERT INTO clinical_reasoning_versions (
          encounter_id, version_number, user_id, user_name, user_role,
          change_type, change_summary, snapshot
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8);
      `, [
        encounterId, i + 1, testUserId, 'Dr. Test', 'Doctor',
        changes[i].type, changes[i].summary, JSON.stringify(snapshot)
      ]);
    }

    // Query and verify all change types
    const result = await pool.query(`
      SELECT version_number, change_type, change_summary
      FROM clinical_reasoning_versions
      WHERE encounter_id = $1
      ORDER BY version_number;
    `, [encounterId]);

    expect(result.rows.length).toBe(7);
    changes.forEach((change, index) => {
      expect(result.rows[index].change_type).toBe(change.type);
      expect(result.rows[index].change_summary).toBe(change.summary);
    });

    // Clean up
    await pool.query('DELETE FROM clinical_reasoning_versions WHERE encounter_id = $1', [encounterId]);
  });
});
