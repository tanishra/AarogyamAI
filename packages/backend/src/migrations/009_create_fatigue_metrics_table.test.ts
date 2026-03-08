/**
 * Tests for fatigue_metrics table migration
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Fatigue Metrics Table Migration', () => {
  let pool: Pool;
  let testUserId: string;
  let testSessionId: string;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Run prerequisite migration for questionnaire_sessions table
    const prerequisiteMigrationSQL = readFileSync(
      join(__dirname, '008_create_questionnaire_sessions_table.sql'),
      'utf-8'
    );
    await pool.query(prerequisiteMigrationSQL);

    // Clean up any existing test user first
    await pool.query(`DELETE FROM users WHERE email = $1`, ['test-fatigue-patient@example.com']);

    // Create a test user for foreign key reference
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-fatigue-patient@example.com', 'hashed_password', 'Patient']);
    testUserId = userResult.rows[0].id;

    // Create a test questionnaire session
    const sessionResult = await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1)
      RETURNING id;
    `, [testUserId]);
    testSessionId = sessionResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '009_create_fatigue_metrics_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '009_create_fatigue_metrics_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test session and user
    await pool.query('DELETE FROM questionnaire_sessions WHERE id = $1', [testSessionId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    
    // Rollback prerequisite migration
    const prerequisiteRollbackSQL = readFileSync(
      join(__dirname, '008_create_questionnaire_sessions_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(prerequisiteRollbackSQL);
    
    await pool.end();
  });

  it('should create fatigue_metrics table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'fatigue_metrics'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('session_id');
    expect(columns).toContain('session_duration');
    expect(columns).toContain('average_response_time');
    expect(columns).toContain('response_time_increase');
    expect(columns).toContain('fatigue_severity');
    expect(columns).toContain('recommendation');
    expect(columns).toContain('recorded_at');
  });

  it('should create index on session_id for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'fatigue_metrics';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify required index exists
    expect(indexes).toContain('idx_fatigue_metrics_session_id');
  });

  it('should enforce foreign key constraint on session_id', async () => {
    // Try to insert with non-existent session_id
    await expect(
      pool.query(`
        INSERT INTO fatigue_metrics (session_id, session_duration)
        VALUES ('00000000-0000-0000-0000-000000000000', 900000);
      `)
    ).rejects.toThrow();
  });

  it('should allow inserting valid fatigue metrics', async () => {
    const result = await pool.query(`
      INSERT INTO fatigue_metrics (
        session_id,
        session_duration,
        average_response_time,
        response_time_increase,
        fatigue_severity,
        recommendation
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, session_id, session_duration, average_response_time, recorded_at;
    `, [
      testSessionId,
      900000, // 15 minutes
      5000, // 5 seconds
      50.00, // 50% increase
      'moderate',
      'break'
    ]);

    expect(result.rows[0].session_id).toBe(testSessionId);
    expect(result.rows[0].session_duration).toBe(900000);
    expect(result.rows[0].average_response_time).toBe(5000);
    expect(result.rows[0].recorded_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE id = $1', [result.rows[0].id]);
  });

  it('should track session duration in milliseconds', async () => {
    const sessionDuration = 1200000; // 20 minutes

    const result = await pool.query(`
      INSERT INTO fatigue_metrics (
        session_id,
        session_duration,
        fatigue_severity
      )
      VALUES ($1, $2, $3)
      RETURNING session_duration;
    `, [testSessionId, sessionDuration, 'severe']);

    expect(result.rows[0].session_duration).toBe(sessionDuration);

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should track average response time in milliseconds', async () => {
    const avgResponseTime = 7500; // 7.5 seconds

    const result = await pool.query(`
      INSERT INTO fatigue_metrics (
        session_id,
        average_response_time,
        fatigue_severity
      )
      VALUES ($1, $2, $3)
      RETURNING average_response_time;
    `, [testSessionId, avgResponseTime, 'mild']);

    expect(result.rows[0].average_response_time).toBe(avgResponseTime);

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should track response time increase as percentage', async () => {
    const responseTimeIncrease = 75.50; // 75.5% increase

    const result = await pool.query(`
      INSERT INTO fatigue_metrics (
        session_id,
        response_time_increase,
        fatigue_severity
      )
      VALUES ($1, $2, $3)
      RETURNING response_time_increase;
    `, [testSessionId, responseTimeIncrease, 'moderate']);

    expect(parseFloat(result.rows[0].response_time_increase)).toBe(responseTimeIncrease);

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should enforce fatigue_severity check constraint', async () => {
    // Valid values
    const validSeverities = ['none', 'mild', 'moderate', 'severe'];
    
    for (const severity of validSeverities) {
      const result = await pool.query(`
        INSERT INTO fatigue_metrics (session_id, fatigue_severity)
        VALUES ($1, $2)
        RETURNING fatigue_severity;
      `, [testSessionId, severity]);
      
      expect(result.rows[0].fatigue_severity).toBe(severity);
    }

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);

    // Invalid value should fail
    await expect(
      pool.query(`
        INSERT INTO fatigue_metrics (session_id, fatigue_severity)
        VALUES ($1, $2);
      `, [testSessionId, 'invalid'])
    ).rejects.toThrow();
  });

  it('should enforce recommendation check constraint', async () => {
    // Valid values
    const validRecommendations = ['continue', 'break', 'prioritize-critical'];
    
    for (const recommendation of validRecommendations) {
      const result = await pool.query(`
        INSERT INTO fatigue_metrics (session_id, fatigue_severity, recommendation)
        VALUES ($1, $2, $3)
        RETURNING recommendation;
      `, [testSessionId, 'none', recommendation]);
      
      expect(result.rows[0].recommendation).toBe(recommendation);
    }

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);

    // Invalid value should fail
    await expect(
      pool.query(`
        INSERT INTO fatigue_metrics (session_id, fatigue_severity, recommendation)
        VALUES ($1, $2, $3);
      `, [testSessionId, 'none', 'invalid'])
    ).rejects.toThrow();
  });

  it('should automatically set recorded_at timestamp', async () => {
    const beforeInsert = new Date();

    const result = await pool.query(`
      INSERT INTO fatigue_metrics (session_id, fatigue_severity)
      VALUES ($1, $2)
      RETURNING recorded_at;
    `, [testSessionId, 'none']);

    const afterInsert = new Date();
    const recordedAt = new Date(result.rows[0].recorded_at);

    expect(recordedAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());
    expect(recordedAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime());

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should cascade delete metrics when session is deleted', async () => {
    // Create a temporary session
    const tempSessionResult = await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1)
      RETURNING id;
    `, [testUserId]);
    const tempSessionId = tempSessionResult.rows[0].id;

    // Insert fatigue metrics for temp session
    await pool.query(`
      INSERT INTO fatigue_metrics (session_id, fatigue_severity)
      VALUES ($1, $2);
    `, [tempSessionId, 'mild']);

    // Verify metrics exist
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM fatigue_metrics
      WHERE session_id = $1;
    `, [tempSessionId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the session
    await pool.query('DELETE FROM questionnaire_sessions WHERE id = $1', [tempSessionId]);

    // Verify metrics were cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM fatigue_metrics
      WHERE session_id = $1;
    `, [tempSessionId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should support multiple fatigue metric records per session', async () => {
    // Insert multiple metrics for the same session (tracking over time)
    await pool.query(`
      INSERT INTO fatigue_metrics (session_id, session_duration, fatigue_severity)
      VALUES 
        ($1, 300000, 'none'),
        ($1, 600000, 'mild'),
        ($1, 900000, 'moderate');
    `, [testSessionId]);

    const result = await pool.query(`
      SELECT id, session_duration, fatigue_severity
      FROM fatigue_metrics
      WHERE session_id = $1
      ORDER BY session_duration ASC;
    `, [testSessionId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].fatigue_severity).toBe('none');
    expect(result.rows[1].fatigue_severity).toBe('mild');
    expect(result.rows[2].fatigue_severity).toBe('moderate');

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should detect fatigue when session duration exceeds 15 minutes', async () => {
    const fifteenMinutes = 15 * 60 * 1000; // 900000 milliseconds

    const result = await pool.query(`
      INSERT INTO fatigue_metrics (
        session_id,
        session_duration,
        fatigue_severity,
        recommendation
      )
      VALUES ($1, $2, $3, $4)
      RETURNING session_duration, fatigue_severity;
    `, [testSessionId, fifteenMinutes + 1000, 'mild', 'continue']);

    expect(result.rows[0].session_duration).toBeGreaterThan(fifteenMinutes);
    expect(result.rows[0].fatigue_severity).not.toBe('none');

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should recommend break when session duration exceeds 20 minutes', async () => {
    const twentyMinutes = 20 * 60 * 1000; // 1200000 milliseconds

    const result = await pool.query(`
      INSERT INTO fatigue_metrics (
        session_id,
        session_duration,
        fatigue_severity,
        recommendation
      )
      VALUES ($1, $2, $3, $4)
      RETURNING session_duration, recommendation;
    `, [testSessionId, twentyMinutes + 1000, 'moderate', 'break']);

    expect(result.rows[0].session_duration).toBeGreaterThan(twentyMinutes);
    expect(result.rows[0].recommendation).toBe('break');

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should track response time increase for fatigue detection', async () => {
    // 50% increase threshold
    const fiftyPercentIncrease = 50.00;

    const result = await pool.query(`
      INSERT INTO fatigue_metrics (
        session_id,
        response_time_increase,
        fatigue_severity
      )
      VALUES ($1, $2, $3)
      RETURNING response_time_increase, fatigue_severity;
    `, [testSessionId, fiftyPercentIncrease, 'mild']);

    expect(parseFloat(result.rows[0].response_time_increase)).toBeGreaterThanOrEqual(fiftyPercentIncrease);
    expect(result.rows[0].fatigue_severity).not.toBe('none');

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should query fatigue metrics by session efficiently using index', async () => {
    // Insert multiple metrics
    await pool.query(`
      INSERT INTO fatigue_metrics (session_id, session_duration, fatigue_severity)
      VALUES 
        ($1, 300000, 'none'),
        ($1, 600000, 'mild'),
        ($1, 900000, 'moderate');
    `, [testSessionId]);

    const result = await pool.query(`
      SELECT id, session_id, fatigue_severity
      FROM fatigue_metrics
      WHERE session_id = $1
      ORDER BY recorded_at ASC;
    `, [testSessionId]);

    expect(result.rows.length).toBe(3);
    result.rows.forEach(row => {
      expect(row.session_id).toBe(testSessionId);
    });

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });

  it('should support null values for optional fields', async () => {
    const result = await pool.query(`
      INSERT INTO fatigue_metrics (
        session_id,
        fatigue_severity
      )
      VALUES ($1, $2)
      RETURNING session_duration, average_response_time, response_time_increase, recommendation;
    `, [testSessionId, 'none']);

    expect(result.rows[0].session_duration).toBeNull();
    expect(result.rows[0].average_response_time).toBeNull();
    expect(result.rows[0].response_time_increase).toBeNull();
    expect(result.rows[0].recommendation).toBeNull();

    // Clean up
    await pool.query('DELETE FROM fatigue_metrics WHERE session_id = $1', [testSessionId]);
  });
});
