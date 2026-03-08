/**
 * Tests for question_logs table migration
 * Requirements: 5.1, 5.2, 5.3, 5.6
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Question Logs Table Migration', () => {
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
    await pool.query(`DELETE FROM users WHERE email = $1`, ['test-question-logs-patient@example.com']);

    // Create a test user for foreign key reference
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING id;
    `, ['test-question-logs-patient@example.com', 'hashed_password', 'Patient']);
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
      join(__dirname, '010_create_question_logs_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '010_create_question_logs_table_rollback.sql'),
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

  it('should create question_logs table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'question_logs'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('session_id');
    expect(columns).toContain('question_id');
    expect(columns).toContain('question_text');
    expect(columns).toContain('priority_score');
    expect(columns).toContain('category');
    expect(columns).toContain('clinical_relevance');
    expect(columns).toContain('red_flag');
    expect(columns).toContain('rationale');
    expect(columns).toContain('asked_at');
  });

  it('should create index on session_id for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'question_logs';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify required index exists
    expect(indexes).toContain('idx_question_logs_session_id');
  });

  it('should enforce foreign key constraint on session_id', async () => {
    // Try to insert with non-existent session_id
    await expect(
      pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text)
        VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'Test question');
      `)
    ).rejects.toThrow();
  });

  it('should allow inserting valid question logs', async () => {
    const questionId = '123e4567-e89b-12d3-a456-426614174000';
    const questionText = 'Do you have chest pain?';
    const priorityScore = 9;
    const category = 'red-flag';
    const clinicalRelevance = 'Chest pain is a critical symptom requiring immediate assessment';
    const redFlag = true;
    const rationale = 'Patient mentioned discomfort in chest area, need to assess for cardiac issues';

    const result = await pool.query(`
      INSERT INTO question_logs (
        session_id,
        question_id,
        question_text,
        priority_score,
        category,
        clinical_relevance,
        red_flag,
        rationale
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, session_id, question_id, question_text, priority_score, category, red_flag, asked_at;
    `, [
      testSessionId,
      questionId,
      questionText,
      priorityScore,
      category,
      clinicalRelevance,
      redFlag,
      rationale
    ]);

    expect(result.rows[0].session_id).toBe(testSessionId);
    expect(result.rows[0].question_id).toBe(questionId);
    expect(result.rows[0].question_text).toBe(questionText);
    expect(result.rows[0].priority_score).toBe(priorityScore);
    expect(result.rows[0].category).toBe(category);
    expect(result.rows[0].red_flag).toBe(redFlag);
    expect(result.rows[0].asked_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE id = $1', [result.rows[0].id]);
  });

  it('should enforce priority_score check constraint (1-10)', async () => {
    const questionId = '123e4567-e89b-12d3-a456-426614174001';
    
    // Valid priority scores (1-10)
    for (let score = 1; score <= 10; score++) {
      const result = await pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text, priority_score)
        VALUES ($1, $2, $3, $4)
        RETURNING priority_score;
      `, [testSessionId, questionId, `Test question ${score}`, score]);
      
      expect(result.rows[0].priority_score).toBe(score);
    }

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);

    // Invalid priority scores should fail
    await expect(
      pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text, priority_score)
        VALUES ($1, $2, $3, $4);
      `, [testSessionId, questionId, 'Test question', 0])
    ).rejects.toThrow();

    await expect(
      pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text, priority_score)
        VALUES ($1, $2, $3, $4);
      `, [testSessionId, questionId, 'Test question', 11])
    ).rejects.toThrow();
  });

  it('should track high priority questions (priority >= 8)', async () => {
    const highPriorityQuestions = [
      { id: '123e4567-e89b-12d3-a456-426614174010', text: 'Do you have severe chest pain?', priority: 10 },
      { id: '123e4567-e89b-12d3-a456-426614174009', text: 'Are you experiencing shortness of breath?', priority: 9 },
      { id: '123e4567-e89b-12d3-a456-426614174008', text: 'Do you have a history of heart disease?', priority: 8 },
    ];

    for (const q of highPriorityQuestions) {
      await pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text, priority_score)
        VALUES ($1, $2, $3, $4);
      `, [testSessionId, q.id, q.text, q.priority]);
    }

    const result = await pool.query(`
      SELECT question_text, priority_score
      FROM question_logs
      WHERE session_id = $1 AND priority_score >= 8
      ORDER BY priority_score DESC;
    `, [testSessionId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].priority_score).toBe(10);
    expect(result.rows[1].priority_score).toBe(9);
    expect(result.rows[2].priority_score).toBe(8);

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should track red flag questions', async () => {
    const redFlagQuestions = [
      { id: '123e4567-e89b-12d3-a456-426614174020', text: 'Are you experiencing sudden severe headache?', redFlag: true },
      { id: '123e4567-e89b-12d3-a456-426614174021', text: 'Do you have difficulty breathing?', redFlag: true },
      { id: '123e4567-e89b-12d3-a456-426614174022', text: 'What is your age?', redFlag: false },
    ];

    for (const q of redFlagQuestions) {
      await pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text, red_flag)
        VALUES ($1, $2, $3, $4);
      `, [testSessionId, q.id, q.text, q.redFlag]);
    }

    const result = await pool.query(`
      SELECT question_text, red_flag
      FROM question_logs
      WHERE session_id = $1 AND red_flag = true;
    `, [testSessionId]);

    expect(result.rows.length).toBe(2);
    result.rows.forEach(row => {
      expect(row.red_flag).toBe(true);
    });

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should store question category', async () => {
    const categories = ['red-flag', 'high-risk', 'diagnostic', 'contextual'];
    
    for (let i = 0; i < categories.length; i++) {
      await pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text, category)
        VALUES ($1, $2, $3, $4);
      `, [testSessionId, `123e4567-e89b-12d3-a456-42661417${i.toString().padStart(4, '0')}`, `Question ${i}`, categories[i]]);
    }

    const result = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM question_logs
      WHERE session_id = $1
      GROUP BY category
      ORDER BY category;
    `, [testSessionId]);

    expect(result.rows.length).toBe(4);
    expect(result.rows.map(r => r.category)).toEqual(['contextual', 'diagnostic', 'high-risk', 'red-flag']);

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should store clinical relevance description', async () => {
    const clinicalRelevance = 'This question helps assess cardiovascular risk factors based on family history';
    
    const result = await pool.query(`
      INSERT INTO question_logs (
        session_id,
        question_id,
        question_text,
        clinical_relevance
      )
      VALUES ($1, $2, $3, $4)
      RETURNING clinical_relevance;
    `, [
      testSessionId,
      '123e4567-e89b-12d3-a456-426614174030',
      'Does anyone in your family have heart disease?',
      clinicalRelevance
    ]);

    expect(result.rows[0].clinical_relevance).toBe(clinicalRelevance);

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should store rationale for question selection', async () => {
    const rationale = 'Patient reported chest discomfort; following up with specific cardiac symptom questions per clinical decision tree';
    
    const result = await pool.query(`
      INSERT INTO question_logs (
        session_id,
        question_id,
        question_text,
        rationale
      )
      VALUES ($1, $2, $3, $4)
      RETURNING rationale;
    `, [
      testSessionId,
      '123e4567-e89b-12d3-a456-426614174040',
      'Does the chest pain radiate to your left arm?',
      rationale
    ]);

    expect(result.rows[0].rationale).toBe(rationale);

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should automatically set asked_at timestamp', async () => {
    const beforeInsert = new Date();

    const result = await pool.query(`
      INSERT INTO question_logs (session_id, question_id, question_text)
      VALUES ($1, $2, $3)
      RETURNING asked_at;
    `, [testSessionId, '123e4567-e89b-12d3-a456-426614174050', 'Test question']);

    const afterInsert = new Date();
    const askedAt = new Date(result.rows[0].asked_at);

    expect(askedAt.getTime()).toBeGreaterThanOrEqual(beforeInsert.getTime());
    expect(askedAt.getTime()).toBeLessThanOrEqual(afterInsert.getTime());

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should cascade delete question logs when session is deleted', async () => {
    // Create a temporary session
    const tempSessionResult = await pool.query(`
      INSERT INTO questionnaire_sessions (patient_id)
      VALUES ($1)
      RETURNING id;
    `, [testUserId]);
    const tempSessionId = tempSessionResult.rows[0].id;

    // Insert question logs for temp session
    await pool.query(`
      INSERT INTO question_logs (session_id, question_id, question_text)
      VALUES ($1, $2, $3);
    `, [tempSessionId, '123e4567-e89b-12d3-a456-426614174060', 'Temp question']);

    // Verify logs exist
    let result = await pool.query(`
      SELECT COUNT(*) as count
      FROM question_logs
      WHERE session_id = $1;
    `, [tempSessionId]);
    expect(parseInt(result.rows[0].count)).toBe(1);

    // Delete the session
    await pool.query('DELETE FROM questionnaire_sessions WHERE id = $1', [tempSessionId]);

    // Verify logs were cascade deleted
    result = await pool.query(`
      SELECT COUNT(*) as count
      FROM question_logs
      WHERE session_id = $1;
    `, [tempSessionId]);
    expect(parseInt(result.rows[0].count)).toBe(0);
  });

  it('should support multiple question logs per session', async () => {
    const questions = [
      { id: '123e4567-e89b-12d3-a456-426614174070', text: 'What brings you in today?', priority: 10 },
      { id: '123e4567-e89b-12d3-a456-426614174071', text: 'When did symptoms start?', priority: 9 },
      { id: '123e4567-e89b-12d3-a456-426614174072', text: 'Do you have any allergies?', priority: 7 },
    ];

    for (const q of questions) {
      await pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text, priority_score)
        VALUES ($1, $2, $3, $4);
      `, [testSessionId, q.id, q.text, q.priority]);
    }

    const result = await pool.query(`
      SELECT question_text, priority_score
      FROM question_logs
      WHERE session_id = $1
      ORDER BY asked_at ASC;
    `, [testSessionId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].question_text).toBe('What brings you in today?');
    expect(result.rows[1].question_text).toBe('When did symptoms start?');
    expect(result.rows[2].question_text).toBe('Do you have any allergies?');

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should query question logs by session efficiently using index', async () => {
    // Insert multiple logs
    for (let i = 0; i < 5; i++) {
      await pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text, priority_score)
        VALUES ($1, $2, $3, $4);
      `, [testSessionId, `123e4567-e89b-12d3-a456-42661417${i.toString().padStart(4, '0')}`, `Question ${i}`, 5]);
    }

    const result = await pool.query(`
      SELECT id, session_id, question_text
      FROM question_logs
      WHERE session_id = $1
      ORDER BY asked_at ASC;
    `, [testSessionId]);

    expect(result.rows.length).toBe(5);
    result.rows.forEach(row => {
      expect(row.session_id).toBe(testSessionId);
    });

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should support null values for optional fields', async () => {
    const result = await pool.query(`
      INSERT INTO question_logs (
        session_id,
        question_id,
        question_text
      )
      VALUES ($1, $2, $3)
      RETURNING priority_score, category, clinical_relevance, rationale;
    `, [testSessionId, '123e4567-e89b-12d3-a456-426614174080', 'Simple question']);

    expect(result.rows[0].priority_score).toBeNull();
    expect(result.rows[0].category).toBeNull();
    expect(result.rows[0].clinical_relevance).toBeNull();
    expect(result.rows[0].rationale).toBeNull();

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should default red_flag to false when not specified', async () => {
    const result = await pool.query(`
      INSERT INTO question_logs (
        session_id,
        question_id,
        question_text
      )
      VALUES ($1, $2, $3)
      RETURNING red_flag;
    `, [testSessionId, '123e4567-e89b-12d3-a456-426614174090', 'Non-urgent question']);

    expect(result.rows[0].red_flag).toBe(false);

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });

  it('should track question ordering by asked_at timestamp', async () => {
    const questions = [
      { id: '123e4567-e89b-12d3-a456-426614174100', text: 'First question' },
      { id: '123e4567-e89b-12d3-a456-426614174101', text: 'Second question' },
      { id: '123e4567-e89b-12d3-a456-426614174102', text: 'Third question' },
    ];

    for (const q of questions) {
      await pool.query(`
        INSERT INTO question_logs (session_id, question_id, question_text)
        VALUES ($1, $2, $3);
      `, [testSessionId, q.id, q.text]);
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    const result = await pool.query(`
      SELECT question_text, asked_at
      FROM question_logs
      WHERE session_id = $1
      ORDER BY asked_at ASC;
    `, [testSessionId]);

    expect(result.rows.length).toBe(3);
    expect(result.rows[0].question_text).toBe('First question');
    expect(result.rows[1].question_text).toBe('Second question');
    expect(result.rows[2].question_text).toBe('Third question');

    // Verify timestamps are in ascending order
    const timestamp1 = new Date(result.rows[0].asked_at).getTime();
    const timestamp2 = new Date(result.rows[1].asked_at).getTime();
    const timestamp3 = new Date(result.rows[2].asked_at).getTime();
    expect(timestamp2).toBeGreaterThanOrEqual(timestamp1);
    expect(timestamp3).toBeGreaterThanOrEqual(timestamp2);

    // Clean up
    await pool.query('DELETE FROM question_logs WHERE session_id = $1', [testSessionId]);
  });
});
