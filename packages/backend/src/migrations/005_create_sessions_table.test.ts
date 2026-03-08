/**
 * Tests for sessions table migration
 * Requirements: 14.1, 14.2, 14.6
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Sessions Table Migration', () => {
  let pool: Pool;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '005_create_sessions_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '005_create_sessions_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    await pool.end();
  });

  it('should create sessions table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'sessions'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('user_id');
    expect(columns).toContain('token_hash');
    expect(columns).toContain('ip_address');
    expect(columns).toContain('user_agent');
    expect(columns).toContain('device_type');
    expect(columns).toContain('location');
    expect(columns).toContain('mfa_verified');
    expect(columns).toContain('created_at');
    expect(columns).toContain('last_activity');
    expect(columns).toContain('expires_at');
    expect(columns).toContain('terminated_at');
    expect(columns).toContain('termination_reason');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'sessions';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_sessions_user_id');
    expect(indexes).toContain('idx_sessions_token_hash');
    expect(indexes).toContain('idx_sessions_expires_at');
    expect(indexes).toContain('idx_sessions_last_activity');
    expect(indexes).toContain('idx_sessions_active');
  });

  it('should have foreign key constraint to users table', async () => {
    const result = await pool.query(`
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'sessions'
        AND tc.constraint_type = 'FOREIGN KEY';
    `);

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows[0].column_name).toBe('user_id');
    expect(result.rows[0].foreign_table_name).toBe('users');
    expect(result.rows[0].foreign_column_name).toBe('id');
  });

  it('should have unique constraint on token_hash', async () => {
    const result = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'sessions'
        AND constraint_type = 'UNIQUE';
    `);

    const uniqueConstraints = result.rows.map(row => row.constraint_name);
    expect(uniqueConstraints.some(name => name.includes('token_hash'))).toBe(true);
  });

  it('should allow inserting a valid session record', async () => {
    // First, create a test user
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ('test@example.com', 'hashed_password', 'Patient', 'Test User')
      RETURNING id;
    `);
    const userId = userResult.rows[0].id;

    // Insert a session
    const sessionResult = await pool.query(`
      INSERT INTO sessions (
        user_id,
        token_hash,
        ip_address,
        user_agent,
        device_type,
        mfa_verified,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW() + INTERVAL '15 minutes')
      RETURNING id, user_id, token_hash, mfa_verified;
    `, [
      userId,
      'hashed_token_123',
      '192.168.1.1',
      'Mozilla/5.0',
      'desktop',
      true
    ]);

    expect(sessionResult.rows[0].user_id).toBe(userId);
    expect(sessionResult.rows[0].token_hash).toBe('hashed_token_123');
    expect(sessionResult.rows[0].mfa_verified).toBe(true);

    // Clean up
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  it('should track last_activity timestamp', async () => {
    // Create a test user
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ('activity@example.com', 'hashed_password', 'Patient', 'Activity User')
      RETURNING id;
    `);
    const userId = userResult.rows[0].id;

    // Insert a session
    const sessionResult = await pool.query(`
      INSERT INTO sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
      RETURNING id, last_activity;
    `, [userId, 'activity_token_123']);

    const sessionId = sessionResult.rows[0].id;
    const initialActivity = sessionResult.rows[0].last_activity;

    // Wait a moment and update activity
    await new Promise(resolve => setTimeout(resolve, 100));
    
    await pool.query(`
      UPDATE sessions
      SET last_activity = NOW()
      WHERE id = $1;
    `, [sessionId]);

    const updatedResult = await pool.query(`
      SELECT last_activity
      FROM sessions
      WHERE id = $1;
    `, [sessionId]);

    const updatedActivity = updatedResult.rows[0].last_activity;
    
    expect(new Date(updatedActivity).getTime()).toBeGreaterThan(
      new Date(initialActivity).getTime()
    );

    // Clean up
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  it('should support session termination tracking', async () => {
    // Create a test user
    const userResult = await pool.query(`
      INSERT INTO users (email, password_hash, role, name)
      VALUES ('terminate@example.com', 'hashed_password', 'Patient', 'Terminate User')
      RETURNING id;
    `);
    const userId = userResult.rows[0].id;

    // Insert a session
    const sessionResult = await pool.query(`
      INSERT INTO sessions (
        user_id,
        token_hash,
        expires_at
      )
      VALUES ($1, $2, NOW() + INTERVAL '15 minutes')
      RETURNING id;
    `, [userId, 'terminate_token_123']);

    const sessionId = sessionResult.rows[0].id;

    // Terminate the session
    await pool.query(`
      UPDATE sessions
      SET terminated_at = NOW(),
          termination_reason = 'timeout'
      WHERE id = $1;
    `, [sessionId]);

    const result = await pool.query(`
      SELECT terminated_at, termination_reason
      FROM sessions
      WHERE id = $1;
    `, [sessionId]);

    expect(result.rows[0].terminated_at).not.toBeNull();
    expect(result.rows[0].termination_reason).toBe('timeout');

    // Clean up
    await pool.query('DELETE FROM sessions WHERE id = $1', [sessionId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });
});
