/**
 * Tests for questionnaire_sessions table migration
 * Requirements: 1.3, 1.4, 1.5, 3.1, 3.2, 3.3
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Questionnaire Sessions Table Migration', () => {
  let pool: Pool;
  let testUserId: string;

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
    `, ['test-patient@example.com', 'hashed_password', 'Patient']);
    testUserId = userResult.rows[0].id;

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '008_create_questionnaire_sessions_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '008_create_questionnaire_sessions_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    
    // Clean up test user
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    
    await pool.end();
  });

  it('should create questionnaire_sessions table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'questionnaire_sessions'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('patient_id');
    expect(columns).toContain('current_question_index');
    expect(columns).toContain('answers');
    expect(columns).toContain('skipped_questions');
    expect(columns).toContain('uncertain_answers');
    expect(columns).toContain('started_at');
    expect(columns).toContain('last_activity');
    expect(columns).toContain('completed_at');
    expect(columns).toContain('archived_at');
    expect(columns).toContain('session_data');
    expect(columns).toContain('fatigue_metrics');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'questionnaire_sessions';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_questionnaire_sessions_patient_id');
    expect(indexes).toContain('idx_questionnaire_sessions_last_activity');
  });

  it('should enforce foreign key constraint on patient_id', async () => {
    // Try to insert with non-existent patient_id
    await expect(
      pool.query(`
        INSERT INTO questionnaire_sessions (patient_id)
        VALUES ('00000000-0000-0000-0000-000000000000');
      `)
    ).rejects.toThrow();
  });

  it('should allow inserting a valid questionnaire session', async () => {
    const result = await pool.query(`
      INSERT INTO questionnaire_sessions (
        patient_id,
        current_question_index,
        answers,
        skipped_questions,
        uncertain_answers
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, patient_id, current_question_index, started_at, last_activity;
    `, [
      testUserId,
      0,
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([])
    ]);

    expect(result.rows[0].patient_id).toBe(testUserId);
    expect(result.rows[0].current_question_index).toBe(0);
    expect(result.rows[0].started_at).not.toBeNull();
    expect(result.rows[0].last_activity).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE id = $1', [result.rows[0].id]);
  });

  it('should store answers as JSONB array', async () => {
    const answers = [
      { questionId: 'q1', value: 'Yes', timestamp: new Date().toISOString(), responseTime: 5000 },
      { questionId: 'q2', value: 'No', timestamp: new Date().toISOString(), responseTime: 3000 }
    ];

    const result = await pool.query(`
      INSERT INTO questionnaire_sessions (
        patient_id,
        answers
      )
      VALUES ($1, $2)
      RETURNING answers;
    `, [testUserId, JSON.stringify(answers)]);

    expect(result.rows[0].answers).toEqual(answers);

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });

  it('should store skipped questions as JSONB array', async () => {
    const skippedQuestions = [
      { questionId: 'q3', text: 'Do you have allergies?', skippedAt: new Date().toISOString() },
      { questionId: 'q5', text: 'Family history?', skippedAt: new Date().toISOString() }
    ];

    const result = await pool.query(`
      INSERT INTO questionnaire_sessions (
        patient_id,
        skipped_questions
      )
      VALUES ($1, $2)
      RETURNING skipped_questions;
    `, [testUserId, JSON.stringify(skippedQuestions)]);

    expect(result.rows[0].skipped_questions).toEqual(skippedQuestions);

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });

  it('should store uncertain answers as JSONB array', async () => {
    const uncertainAnswers = [
      { questionId: 'q4', value: 'Not Sure', timestamp: new Date().toISOString(), uncertain: true }
    ];

    const result = await pool.query(`
      INSERT INTO questionnaire_sessions (
        patient_id,
        uncertain_answers
      )
      VALUES ($1, $2)
      RETURNING uncertain_answers;
    `, [testUserId, JSON.stringify(uncertainAnswers)]);

    expect(result.rows[0].uncertain_answers).toEqual(uncertainAnswers);

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });

  it('should support encrypted session_data field for progress saving', async () => {
    const encryptedData = 'encrypted_session_state_here';

    const result = await pool.query(`
      INSERT INTO questionnaire_sessions (
        patient_id,
        session_data
      )
      VALUES ($1, $2)
      RETURNING session_data;
    `, [testUserId, encryptedData]);

    expect(result.rows[0].session_data).toBe(encryptedData);

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });

  it('should store fatigue_metrics as JSONB', async () => {
    const fatigueMetrics = {
      sessionDuration: 900000, // 15 minutes in milliseconds
      averageResponseTime: 5000,
      baselineResponseTime: 3000,
      responseTimeIncrease: 0.67,
      fatigued: true,
      severity: 'moderate'
    };

    const result = await pool.query(`
      INSERT INTO questionnaire_sessions (
        patient_id,
        fatigue_metrics
      )
      VALUES ($1, $2)
      RETURNING fatigue_metrics;
    `, [testUserId, JSON.stringify(fatigueMetrics)]);

    expect(result.rows[0].fatigue_metrics).toEqual(fatigueMetrics);

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });

  it('should track session completion with completed_at timestamp', async () => {
    // Insert incomplete session
    const insertResult = await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1)
      RETURNING id, completed_at;
    `, [testUserId]);

    expect(insertResult.rows[0].completed_at).toBeNull();

    // Complete the session
    await pool.query(`
      UPDATE questionnaire_sessions
      SET completed_at = NOW()
      WHERE id = $1;
    `, [insertResult.rows[0].id]);

    const result = await pool.query(`
      SELECT completed_at
      FROM questionnaire_sessions
      WHERE id = $1;
    `, [insertResult.rows[0].id]);

    expect(result.rows[0].completed_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE id = $1', [insertResult.rows[0].id]);
  });

  it('should track session archival with archived_at timestamp', async () => {
    // Insert session
    const insertResult = await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1)
      RETURNING id, archived_at;
    `, [testUserId]);

    expect(insertResult.rows[0].archived_at).toBeNull();

    // Archive the session
    await pool.query(`
      UPDATE questionnaire_sessions
      SET archived_at = NOW()
      WHERE id = $1;
    `, [insertResult.rows[0].id]);

    const result = await pool.query(`
      SELECT archived_at
      FROM questionnaire_sessions
      WHERE id = $1;
    `, [insertResult.rows[0].id]);

    expect(result.rows[0].archived_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE id = $1', [insertResult.rows[0].id]);
  });

  it('should update last_activity timestamp for session continuity', async () => {
    // Insert session
    const insertResult = await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1)
      RETURNING id, last_activity;
    `, [testUserId]);

    const initialActivity = insertResult.rows[0].last_activity;

    // Wait a moment and update activity
    await new Promise(resolve => setTimeout(resolve, 100));

    await pool.query(`
      UPDATE questionnaire_sessions
      SET last_activity = NOW()
      WHERE id = $1;
    `, [insertResult.rows[0].id]);

    const result = await pool.query(`
      SELECT last_activity
      FROM questionnaire_sessions
      WHERE id = $1;
    `, [insertResult.rows[0].id]);

    expect(new Date(result.rows[0].last_activity).getTime()).toBeGreaterThan(
      new Date(initialActivity).getTime()
    );

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE id = $1', [insertResult.rows[0].id]);
  });

  it('should identify sessions for resume based on last_activity', async () => {
    // Insert sessions with different last_activity times
    const now = new Date();
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000);
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000);

    await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id, last_activity, completed_at)
      VALUES 
        ($1, $2, NULL),
        ($1, $3, NULL);
    `, [testUserId, twentyThreeHoursAgo, twentyFiveHoursAgo]);

    // Query sessions that can be resumed (within 24 hours)
    const result = await pool.query(`
      SELECT id, last_activity
      FROM questionnaire_sessions
      WHERE patient_id = $1
        AND completed_at IS NULL
        AND last_activity > NOW() - INTERVAL '24 hours'
      ORDER BY last_activity DESC;
    `, [testUserId]);

    expect(result.rows.length).toBe(1);

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });

  it('should cascade delete sessions when patient is deleted', async () => {
    // Create a temporary test user
    const tempUserResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['temp-patient@example.com', 'hashed_password', 'Patient']);
    const tempUserId = tempUserResult.rows[0].id;

    // Insert session for temp user
    await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1);
    `, [tempUserId]);

    // Verify session exists
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM questionnaire_sessions
      WHERE patient_id = $1;
    `, [tempUserId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the user
    await pool.query('DELETE FROM users WHERE id = $1', [tempUserId]);

    // Verify session was cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM questionnaire_sessions
      WHERE patient_id = $1;
    `, [tempUserId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should track current question progress with current_question_index', async () => {
    const result = await pool.query(`
      INSERT INTO questionnaire_sessions (
        patient_id,
        current_question_index
      )
      VALUES ($1, $2)
      RETURNING current_question_index;
    `, [testUserId, 5]);

    expect(result.rows[0].current_question_index).toBe(5);

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });

  it('should default current_question_index to 0 for new sessions', async () => {
    const result = await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1)
      RETURNING current_question_index;
    `, [testUserId]);

    expect(result.rows[0].current_question_index).toBe(0);

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });

  it('should query sessions by patient efficiently using index', async () => {
    // Insert multiple sessions for the test user
    await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1), ($1), ($1);
    `, [testUserId]);

    const result = await pool.query(`
      SELECT id, patient_id
      FROM questionnaire_sessions
      WHERE patient_id = $1
      ORDER BY started_at DESC;
    `, [testUserId]);

    expect(result.rows.length).toBe(3);
    result.rows.forEach(row => {
      expect(row.patient_id).toBe(testUserId);
    });

    // Clean up
    await pool.query('DELETE FROM questionnaire_sessions WHERE patient_id = $1', [testUserId]);
  });
});
