/**
 * Tests for review_of_systems table migration
 * Requirements: 7.1, 7.2, 7.4, 7.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Review of Systems Table Migration', () => {
  let pool: Pool;
  let testUserId: string;
  let testSessionId: string;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Create a test user for foreign key reference
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-ros@example.com', 'hashed_password', 'Patient']);
    testUserId = userResult.rows[0].id;

    // Create a test chat session for foreign key reference
    const sessionResult = await pool.query(`
      INSERT INTO chat_sessions (patient_id, status)
      VALUES ($1, $2)
      RETURNING id;
    `, [testUserId, 'active']);
    testSessionId = sessionResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '012_create_review_of_systems_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '012_create_review_of_systems_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test data
    await pool.query('DELETE FROM chat_sessions WHERE id = $1', [testSessionId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    
    await pool.end();
  });

  it('should create review_of_systems table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'review_of_systems'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('patient_id');
    expect(columns).toContain('session_id');
    expect(columns).toContain('system');
    expect(columns).toContain('finding');
    expect(columns).toContain('status');
    expect(columns).toContain('severity');
    expect(columns).toContain('duration');
    expect(columns).toContain('critical');
    expect(columns).toContain('recorded_at');
    expect(columns).toContain('created_at');
    expect(columns).toContain('updated_at');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'review_of_systems';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_ros_patient_id');
    expect(indexes).toContain('idx_ros_session_id');
    expect(indexes).toContain('idx_ros_system');
    expect(indexes).toContain('idx_ros_critical');
    expect(indexes).toContain('idx_ros_status');
  });

  it('should enforce foreign key constraint on patient_id', async () => {
    // Try to insert with non-existent patient_id
    await expect(
      pool.query(`
        INSERT INTO review_of_systems (patient_id, system, finding, status)
        VALUES ('00000000-0000-0000-0000-000000000000', 'constitutional', 'Fever', 'positive');
      `)
    ).rejects.toThrow();
  });

  it('should allow NULL for session_id (optional reference)', async () => {
    const result = await pool.query(`
      INSERT INTO review_of_systems (patient_id, session_id, system, finding, status)
      VALUES ($1, NULL, 'constitutional', 'Fever', 'positive')
      RETURNING session_id;
    `, [testUserId]);

    expect(result.rows[0].session_id).toBeNull();

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should enforce system check constraint with all 13 body systems', async () => {
    // Try to insert with invalid system
    await expect(
      pool.query(`
        INSERT INTO review_of_systems (patient_id, system, finding, status)
        VALUES ($1, 'invalid_system', 'Test Finding', 'positive');
      `, [testUserId])
    ).rejects.toThrow();
  });

  it('should allow all valid system values', async () => {
    const systems = [
      'constitutional',
      'heent',
      'cardiovascular',
      'respiratory',
      'gastrointestinal',
      'genitourinary',
      'musculoskeletal',
      'skin',
      'neurological',
      'psychiatric',
      'endocrine',
      'hematologic',
      'allergic_immunologic'
    ];
    
    for (const system of systems) {
      const result = await pool.query(`
        INSERT INTO review_of_systems (patient_id, system, finding, status)
        VALUES ($1, $2, $3, $4)
        RETURNING system;
      `, [testUserId, system, 'Test Finding', 'positive']);

      expect(result.rows[0].system).toBe(system);
    }

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should enforce status check constraint', async () => {
    // Try to insert with invalid status
    await expect(
      pool.query(`
        INSERT INTO review_of_systems (patient_id, system, finding, status)
        VALUES ($1, 'constitutional', 'Test Finding', 'invalid_status');
      `, [testUserId])
    ).rejects.toThrow();
  });

  it('should allow all valid status values', async () => {
    const statuses = ['positive', 'negative', 'unknown'];
    
    for (const status of statuses) {
      const result = await pool.query(`
        INSERT INTO review_of_systems (patient_id, system, finding, status)
        VALUES ($1, $2, $3, $4)
        RETURNING status;
      `, [testUserId, 'constitutional', 'Test Finding', status]);

      expect(result.rows[0].status).toBe(status);
    }

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should enforce severity check constraint', async () => {
    // Try to insert with invalid severity
    await expect(
      pool.query(`
        INSERT INTO review_of_systems (patient_id, system, finding, status, severity)
        VALUES ($1, 'constitutional', 'Test Finding', 'positive', 'invalid_severity');
      `, [testUserId])
    ).rejects.toThrow();
  });

  it('should allow all valid severity values', async () => {
    const severities = ['mild', 'moderate', 'severe'];
    
    for (const severity of severities) {
      const result = await pool.query(`
        INSERT INTO review_of_systems (patient_id, system, finding, status, severity)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING severity;
      `, [testUserId, 'constitutional', 'Test Finding', 'positive', severity]);

      expect(result.rows[0].severity).toBe(severity);
    }

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should allow NULL for severity (optional field)', async () => {
    const result = await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status, severity)
      VALUES ($1, 'constitutional', 'Test Finding', 'negative', NULL)
      RETURNING severity;
    `, [testUserId]);

    expect(result.rows[0].severity).toBeNull();

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should default critical to false', async () => {
    const result = await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES ($1, 'constitutional', 'Test Finding', 'positive')
      RETURNING critical;
    `, [testUserId]);

    expect(result.rows[0].critical).toBe(false);

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should allow setting critical flag to true', async () => {
    const result = await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status, critical)
      VALUES ($1, 'cardiovascular', 'Chest pain', 'positive', true)
      RETURNING critical;
    `, [testUserId]);

    expect(result.rows[0].critical).toBe(true);

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should store duration as text', async () => {
    const duration = '2 weeks';
    
    const result = await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status, duration)
      VALUES ($1, 'constitutional', 'Fever', 'positive', $2)
      RETURNING duration;
    `, [testUserId, duration]);

    expect(result.rows[0].duration).toBe(duration);

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should automatically set recorded_at, created_at, and updated_at timestamps', async () => {
    const result = await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES ($1, 'constitutional', 'Test Finding', 'positive')
      RETURNING recorded_at, created_at, updated_at;
    `, [testUserId]);

    expect(result.rows[0].recorded_at).not.toBeNull();
    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].updated_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should allow inserting a complete review of systems entry', async () => {
    const result = await pool.query(`
      INSERT INTO review_of_systems (
        patient_id,
        session_id,
        system,
        finding,
        status,
        severity,
        duration,
        critical
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;
    `, [
      testUserId,
      testSessionId,
      'cardiovascular',
      'Chest pain with exertion',
      'positive',
      'moderate',
      '3 days',
      true
    ]);

    expect(result.rows[0].patient_id).toBe(testUserId);
    expect(result.rows[0].session_id).toBe(testSessionId);
    expect(result.rows[0].system).toBe('cardiovascular');
    expect(result.rows[0].finding).toBe('Chest pain with exertion');
    expect(result.rows[0].status).toBe('positive');
    expect(result.rows[0].severity).toBe('moderate');
    expect(result.rows[0].duration).toBe('3 days');
    expect(result.rows[0].critical).toBe(true);

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE id = $1', [result.rows[0].id]);
  });

  it('should organize review of systems by body system', async () => {
    // Insert multiple ROS entries across different systems
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES 
        ($1, 'constitutional', 'Fever', 'positive'),
        ($1, 'constitutional', 'Weight loss', 'negative'),
        ($1, 'cardiovascular', 'Chest pain', 'positive'),
        ($1, 'respiratory', 'Shortness of breath', 'positive'),
        ($1, 'gastrointestinal', 'Nausea', 'negative');
    `, [testUserId]);

    // Query organized by system
    const result = await pool.query(`
      SELECT system, finding, status
      FROM review_of_systems
      WHERE patient_id = $1
      ORDER BY system, status DESC;
    `, [testUserId]);

    expect(result.rows.length).toBe(5);
    
    // Verify systems are properly stored
    const systems = result.rows.map(row => row.system);
    expect(systems).toContain('constitutional');
    expect(systems).toContain('cardiovascular');
    expect(systems).toContain('respiratory');
    expect(systems).toContain('gastrointestinal');

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should display positive findings first, then pertinent negatives', async () => {
    // Insert mixed positive and negative findings
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES 
        ($1, 'cardiovascular', 'Chest pain', 'positive'),
        ($1, 'cardiovascular', 'Palpitations', 'negative'),
        ($1, 'cardiovascular', 'Edema', 'positive'),
        ($1, 'cardiovascular', 'Syncope', 'negative');
    `, [testUserId]);

    // Query with positive findings first
    const result = await pool.query(`
      SELECT finding, status
      FROM review_of_systems
      WHERE patient_id = $1 AND system = 'cardiovascular'
      ORDER BY 
        CASE status 
          WHEN 'positive' THEN 1 
          WHEN 'negative' THEN 2 
          WHEN 'unknown' THEN 3 
        END,
        finding;
    `, [testUserId]);

    expect(result.rows.length).toBe(4);
    // First two should be positive
    expect(result.rows[0].status).toBe('positive');
    expect(result.rows[1].status).toBe('positive');
    // Last two should be negative
    expect(result.rows[2].status).toBe('negative');
    expect(result.rows[3].status).toBe('negative');

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should highlight critical findings using the critical flag', async () => {
    // Insert findings with some marked as critical
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status, critical)
      VALUES 
        ($1, 'cardiovascular', 'Severe chest pain', 'positive', true),
        ($1, 'neurological', 'Sudden vision loss', 'positive', true),
        ($1, 'respiratory', 'Mild cough', 'positive', false),
        ($1, 'gastrointestinal', 'Nausea', 'negative', false);
    `, [testUserId]);

    // Query only critical findings
    const result = await pool.query(`
      SELECT system, finding, critical
      FROM review_of_systems
      WHERE patient_id = $1 AND critical = true
      ORDER BY system;
    `, [testUserId]);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].finding).toBe('Severe chest pain');
    expect(result.rows[0].critical).toBe(true);
    expect(result.rows[1].finding).toBe('Sudden vision loss');
    expect(result.rows[1].critical).toBe(true);

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should timestamp each review of systems entry', async () => {
    // Insert entries at different times
    const result1 = await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES ($1, 'constitutional', 'Fever', 'positive')
      RETURNING recorded_at;
    `, [testUserId]);

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 100));

    const result2 = await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES ($1, 'cardiovascular', 'Chest pain', 'positive')
      RETURNING recorded_at;
    `, [testUserId]);

    // Verify timestamps are different
    expect(result1.rows[0].recorded_at).not.toEqual(result2.rows[0].recorded_at);
    expect(new Date(result2.rows[0].recorded_at).getTime()).toBeGreaterThan(
      new Date(result1.rows[0].recorded_at).getTime()
    );

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should query review of systems by patient efficiently using index', async () => {
    // Insert multiple ROS entries
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES 
        ($1, 'constitutional', 'Fever', 'positive'),
        ($1, 'cardiovascular', 'Chest pain', 'positive'),
        ($1, 'respiratory', 'Cough', 'positive');
    `, [testUserId]);

    const result = await pool.query(`
      SELECT system, finding, status
      FROM review_of_systems
      WHERE patient_id = $1
      ORDER BY recorded_at;
    `, [testUserId]);

    expect(result.rows.length).toBe(3);

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should query review of systems by session efficiently using index', async () => {
    // Insert ROS entries for specific session
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, session_id, system, finding, status)
      VALUES 
        ($1, $2, 'constitutional', 'Fever', 'positive'),
        ($1, $2, 'cardiovascular', 'Chest pain', 'positive');
    `, [testUserId, testSessionId]);

    const result = await pool.query(`
      SELECT system, finding
      FROM review_of_systems
      WHERE session_id = $1
      ORDER BY system;
    `, [testSessionId]);

    expect(result.rows.length).toBe(2);

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE session_id = $1', [testSessionId]);
  });

  it('should query review of systems by body system efficiently using index', async () => {
    // Insert multiple entries for different systems
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES 
        ($1, 'cardiovascular', 'Chest pain', 'positive'),
        ($1, 'cardiovascular', 'Palpitations', 'negative'),
        ($1, 'respiratory', 'Cough', 'positive');
    `, [testUserId]);

    const result = await pool.query(`
      SELECT finding, status
      FROM review_of_systems
      WHERE patient_id = $1 AND system = 'cardiovascular'
      ORDER BY finding;
    `, [testUserId]);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].finding).toBe('Chest pain');
    expect(result.rows[1].finding).toBe('Palpitations');

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should query critical findings efficiently using partial index', async () => {
    // Insert findings with some marked as critical
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status, critical)
      VALUES 
        ($1, 'cardiovascular', 'Severe chest pain', 'positive', true),
        ($1, 'neurological', 'Sudden vision loss', 'positive', true),
        ($1, 'respiratory', 'Mild cough', 'positive', false);
    `, [testUserId]);

    const result = await pool.query(`
      SELECT system, finding
      FROM review_of_systems
      WHERE patient_id = $1 AND critical = true
      ORDER BY system;
    `, [testUserId]);

    expect(result.rows.length).toBe(2);

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should cascade delete review of systems when patient is deleted', async () => {
    // Create a temporary test user
    const tempUserResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['temp-ros-patient@example.com', 'hashed_password', 'Patient']);
    const tempUserId = tempUserResult.rows[0].id;

    // Insert ROS for temp user
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES ($1, 'constitutional', 'Test Finding', 'positive');
    `, [tempUserId]);

    // Verify ROS exists
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM review_of_systems
      WHERE patient_id = $1;
    `, [tempUserId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [tempUserId]);

    // Verify ROS was cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM review_of_systems
      WHERE patient_id = $1;
    `, [tempUserId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should cascade delete review of systems when session is deleted', async () => {
    // Create a temporary test session
    const tempSessionResult = await pool.query(`
      INSERT INTO chat_sessions (patient_id, status)
      VALUES ($1, $2)
      RETURNING id;
    `, [testUserId, 'active']);
    const tempSessionId = tempSessionResult.rows[0].id;

    // Insert ROS for temp session
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, session_id, system, finding, status)
      VALUES ($1, $2, 'constitutional', 'Test Finding', 'positive');
    `, [testUserId, tempSessionId]);

    // Verify ROS exists
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM review_of_systems
      WHERE session_id = $1;
    `, [tempSessionId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the session
    await pool.query('DELETE FROM chat_sessions WHERE id = $1', [tempSessionId]);

    // Verify ROS was cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM review_of_systems
      WHERE session_id = $1;
    `, [tempSessionId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should support comprehensive review of systems with all 13 body systems', async () => {
    // Insert a complete ROS across all systems
    await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status, severity)
      VALUES 
        ($1, 'constitutional', 'Fever and chills', 'positive', 'moderate'),
        ($1, 'heent', 'Headache', 'positive', 'mild'),
        ($1, 'cardiovascular', 'Chest pain', 'positive', 'severe'),
        ($1, 'respiratory', 'Shortness of breath', 'positive', 'moderate'),
        ($1, 'gastrointestinal', 'Nausea', 'positive', 'mild'),
        ($1, 'genitourinary', 'Dysuria', 'negative', NULL),
        ($1, 'musculoskeletal', 'Joint pain', 'positive', 'moderate'),
        ($1, 'skin', 'Rash', 'negative', NULL),
        ($1, 'neurological', 'Dizziness', 'positive', 'mild'),
        ($1, 'psychiatric', 'Anxiety', 'positive', 'moderate'),
        ($1, 'endocrine', 'Heat intolerance', 'negative', NULL),
        ($1, 'hematologic', 'Easy bruising', 'negative', NULL),
        ($1, 'allergic_immunologic', 'Seasonal allergies', 'positive', 'mild');
    `, [testUserId]);

    // Query complete ROS
    const result = await pool.query(`
      SELECT system, finding, status, severity
      FROM review_of_systems
      WHERE patient_id = $1
      ORDER BY 
        CASE system
          WHEN 'constitutional' THEN 1
          WHEN 'heent' THEN 2
          WHEN 'cardiovascular' THEN 3
          WHEN 'respiratory' THEN 4
          WHEN 'gastrointestinal' THEN 5
          WHEN 'genitourinary' THEN 6
          WHEN 'musculoskeletal' THEN 7
          WHEN 'skin' THEN 8
          WHEN 'neurological' THEN 9
          WHEN 'psychiatric' THEN 10
          WHEN 'endocrine' THEN 11
          WHEN 'hematologic' THEN 12
          WHEN 'allergic_immunologic' THEN 13
        END;
    `, [testUserId]);

    expect(result.rows.length).toBe(13);
    
    // Verify all systems are present in order
    expect(result.rows[0].system).toBe('constitutional');
    expect(result.rows[1].system).toBe('heent');
    expect(result.rows[2].system).toBe('cardiovascular');
    expect(result.rows[3].system).toBe('respiratory');
    expect(result.rows[4].system).toBe('gastrointestinal');
    expect(result.rows[5].system).toBe('genitourinary');
    expect(result.rows[6].system).toBe('musculoskeletal');
    expect(result.rows[7].system).toBe('skin');
    expect(result.rows[8].system).toBe('neurological');
    expect(result.rows[9].system).toBe('psychiatric');
    expect(result.rows[10].system).toBe('endocrine');
    expect(result.rows[11].system).toBe('hematologic');
    expect(result.rows[12].system).toBe('allergic_immunologic');

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE patient_id = $1', [testUserId]);
  });

  it('should update updated_at timestamp when record is modified', async () => {
    // Insert a ROS entry
    const insertResult = await pool.query(`
      INSERT INTO review_of_systems (patient_id, system, finding, status)
      VALUES ($1, 'constitutional', 'Fever', 'positive')
      RETURNING id, updated_at;
    `, [testUserId]);

    const originalUpdatedAt = insertResult.rows[0].updated_at;
    const rosId = insertResult.rows[0].id;

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Update the record
    const updateResult = await pool.query(`
      UPDATE review_of_systems
      SET severity = 'moderate'
      WHERE id = $1
      RETURNING updated_at;
    `, [rosId]);

    const newUpdatedAt = updateResult.rows[0].updated_at;

    // Verify updated_at changed
    expect(new Date(newUpdatedAt).getTime()).toBeGreaterThan(
      new Date(originalUpdatedAt).getTime()
    );

    // Clean up
    await pool.query('DELETE FROM review_of_systems WHERE id = $1', [rosId]);
  });
});
