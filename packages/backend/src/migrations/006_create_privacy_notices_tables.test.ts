/**
 * Tests for privacy notices tables migration
 * Requirements: 16.1, 16.2, 16.4, 16.5
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Privacy Notices Tables Migration', () => {
  let pool: Pool;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '006_create_privacy_notices_tables.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '006_create_privacy_notices_tables_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    await pool.end();
  });

  describe('privacy_notices table', () => {
    it('should create privacy_notices table with all required columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'privacy_notices'
        ORDER BY ordinal_position;
      `);

      const columns = result.rows.map(row => row.column_name);
      
      // Verify all required columns exist
      expect(columns).toContain('id');
      expect(columns).toContain('version');
      expect(columns).toContain('content');
      expect(columns).toContain('effective_date');
      expect(columns).toContain('sections');
      expect(columns).toContain('created_at');
      expect(columns).toContain('active');
    });

    it('should have unique constraint on version', async () => {
      const result = await pool.query(`
        SELECT constraint_name, constraint_type
        FROM information_schema.table_constraints
        WHERE table_name = 'privacy_notices'
          AND constraint_type = 'UNIQUE';
      `);

      const uniqueConstraints = result.rows.map(row => row.constraint_name);
      expect(uniqueConstraints.some(name => name.includes('version'))).toBe(true);
    });

    it('should create required indexes for privacy_notices', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'privacy_notices';
      `);

      const indexes = result.rows.map(row => row.indexname);
      
      // Verify all required indexes exist
      expect(indexes).toContain('idx_privacy_notices_version');
      expect(indexes).toContain('idx_privacy_notices_active');
    });

    it('should allow inserting a valid privacy notice', async () => {
      const sections = {
        dataCollection: 'We collect your medical information...',
        dataUsage: 'We use your data for treatment...',
        dataSharing: 'We may share data with...',
        patientRights: 'You have the right to...',
        contactInfo: 'Contact us at privacy@example.com'
      };

      const result = await pool.query(`
        INSERT INTO privacy_notices (
          version,
          content,
          effective_date,
          sections,
          active
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, version, active;
      `, [
        '1.0',
        'Full privacy notice content...',
        '2024-01-01',
        JSON.stringify(sections),
        true
      ]);

      expect(result.rows[0].version).toBe('1.0');
      expect(result.rows[0].active).toBe(true);

      // Clean up
      await pool.query('DELETE FROM privacy_notices WHERE id = $1', [result.rows[0].id]);
    });

    it('should enforce unique version constraint', async () => {
      // Insert first notice
      await pool.query(`
        INSERT INTO privacy_notices (version, content, effective_date, sections)
        VALUES ('2.0', 'Content', '2024-01-01', '{}');
      `);

      // Try to insert duplicate version
      await expect(
        pool.query(`
          INSERT INTO privacy_notices (version, content, effective_date, sections)
          VALUES ('2.0', 'Different content', '2024-01-02', '{}');
        `)
      ).rejects.toThrow();

      // Clean up
      await pool.query('DELETE FROM privacy_notices WHERE version = $1', ['2.0']);
    });

    it('should store JSONB sections correctly', async () => {
      const sections = {
        dataCollection: 'Collection policy',
        dataUsage: 'Usage policy',
        dataSharing: 'Sharing policy',
        patientRights: 'Patient rights',
        contactInfo: 'Contact information'
      };

      const insertResult = await pool.query(`
        INSERT INTO privacy_notices (
          version,
          content,
          effective_date,
          sections
        )
        VALUES ($1, $2, $3, $4)
        RETURNING id;
      `, ['3.0', 'Content', '2024-01-01', JSON.stringify(sections)]);

      const selectResult = await pool.query(`
        SELECT sections
        FROM privacy_notices
        WHERE id = $1;
      `, [insertResult.rows[0].id]);

      const retrievedSections = selectResult.rows[0].sections;
      expect(retrievedSections.dataCollection).toBe('Collection policy');
      expect(retrievedSections.dataUsage).toBe('Usage policy');
      expect(retrievedSections.patientRights).toBe('Patient rights');

      // Clean up
      await pool.query('DELETE FROM privacy_notices WHERE id = $1', [insertResult.rows[0].id]);
    });
  });

  describe('privacy_notice_acknowledgments table', () => {
    it('should create privacy_notice_acknowledgments table with all required columns', async () => {
      const result = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'privacy_notice_acknowledgments'
        ORDER BY ordinal_position;
      `);

      const columns = result.rows.map(row => row.column_name);
      
      // Verify all required columns exist
      expect(columns).toContain('id');
      expect(columns).toContain('user_id');
      expect(columns).toContain('notice_id');
      expect(columns).toContain('notice_version');
      expect(columns).toContain('acknowledged_at');
      expect(columns).toContain('ip_address');
      expect(columns).toContain('user_agent');
    });

    it('should create required indexes for privacy_notice_acknowledgments', async () => {
      const result = await pool.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'privacy_notice_acknowledgments';
      `);

      const indexes = result.rows.map(row => row.indexname);
      
      // Verify all required indexes exist
      expect(indexes).toContain('idx_privacy_ack_user_id');
      expect(indexes).toContain('idx_privacy_ack_notice_id');
      expect(indexes).toContain('idx_privacy_ack_user_notice');
    });

    it('should have foreign key constraints', async () => {
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
        WHERE tc.table_name = 'privacy_notice_acknowledgments'
          AND tc.constraint_type = 'FOREIGN KEY'
        ORDER BY kcu.column_name;
      `);

      expect(result.rows.length).toBe(2);
      
      // Check user_id foreign key
      const userFk = result.rows.find(row => row.column_name === 'user_id');
      expect(userFk).toBeDefined();
      expect(userFk?.foreign_table_name).toBe('users');
      expect(userFk?.foreign_column_name).toBe('id');

      // Check notice_id foreign key
      const noticeFk = result.rows.find(row => row.column_name === 'notice_id');
      expect(noticeFk).toBeDefined();
      expect(noticeFk?.foreign_table_name).toBe('privacy_notices');
      expect(noticeFk?.foreign_column_name).toBe('id');
    });

    it('should allow inserting a valid acknowledgment', async () => {
      // Create test user
      const userResult = await pool.query(`
        INSERT INTO users (email, password_hash, role, name)
        VALUES ('privacy@example.com', 'hashed_password', 'Patient', 'Privacy User')
        RETURNING id;
      `);
      const userId = userResult.rows[0].id;

      // Create test privacy notice
      const noticeResult = await pool.query(`
        INSERT INTO privacy_notices (version, content, effective_date, sections)
        VALUES ('4.0', 'Test content', '2024-01-01', '{}')
        RETURNING id;
      `);
      const noticeId = noticeResult.rows[0].id;

      // Insert acknowledgment
      const ackResult = await pool.query(`
        INSERT INTO privacy_notice_acknowledgments (
          user_id,
          notice_id,
          notice_version,
          ip_address,
          user_agent
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, user_id, notice_id, notice_version;
      `, [
        userId,
        noticeId,
        '4.0',
        '192.168.1.1',
        'Mozilla/5.0'
      ]);

      expect(ackResult.rows[0].user_id).toBe(userId);
      expect(ackResult.rows[0].notice_id).toBe(noticeId);
      expect(ackResult.rows[0].notice_version).toBe('4.0');

      // Clean up
      await pool.query('DELETE FROM privacy_notice_acknowledgments WHERE id = $1', [ackResult.rows[0].id]);
      await pool.query('DELETE FROM privacy_notices WHERE id = $1', [noticeId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    });

    it('should track acknowledgment timestamp automatically', async () => {
      // Create test user
      const userResult = await pool.query(`
        INSERT INTO users (email, password_hash, role, name)
        VALUES ('timestamp@example.com', 'hashed_password', 'Patient', 'Timestamp User')
        RETURNING id;
      `);
      const userId = userResult.rows[0].id;

      // Create test privacy notice
      const noticeResult = await pool.query(`
        INSERT INTO privacy_notices (version, content, effective_date, sections)
        VALUES ('5.0', 'Test content', '2024-01-01', '{}')
        RETURNING id;
      `);
      const noticeId = noticeResult.rows[0].id;

      const beforeTime = new Date();

      // Insert acknowledgment without specifying acknowledged_at
      const ackResult = await pool.query(`
        INSERT INTO privacy_notice_acknowledgments (
          user_id,
          notice_id,
          notice_version
        )
        VALUES ($1, $2, $3)
        RETURNING acknowledged_at;
      `, [userId, noticeId, '5.0']);

      const afterTime = new Date();
      const acknowledgedAt = new Date(ackResult.rows[0].acknowledged_at);

      expect(acknowledgedAt.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(acknowledgedAt.getTime()).toBeLessThanOrEqual(afterTime.getTime());

      // Clean up
      await pool.query('DELETE FROM privacy_notice_acknowledgments WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM privacy_notices WHERE id = $1', [noticeId]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    });

    it('should support multiple acknowledgments per user for different notices', async () => {
      // Create test user
      const userResult = await pool.query(`
        INSERT INTO users (email, password_hash, role, name)
        VALUES ('multiple@example.com', 'hashed_password', 'Patient', 'Multiple User')
        RETURNING id;
      `);
      const userId = userResult.rows[0].id;

      // Create two privacy notices
      const notice1Result = await pool.query(`
        INSERT INTO privacy_notices (version, content, effective_date, sections)
        VALUES ('6.0', 'Test content 1', '2024-01-01', '{}')
        RETURNING id;
      `);
      const notice1Id = notice1Result.rows[0].id;

      const notice2Result = await pool.query(`
        INSERT INTO privacy_notices (version, content, effective_date, sections)
        VALUES ('7.0', 'Test content 2', '2024-02-01', '{}')
        RETURNING id;
      `);
      const notice2Id = notice2Result.rows[0].id;

      // Insert acknowledgments for both notices
      await pool.query(`
        INSERT INTO privacy_notice_acknowledgments (user_id, notice_id, notice_version)
        VALUES ($1, $2, $3);
      `, [userId, notice1Id, '6.0']);

      await pool.query(`
        INSERT INTO privacy_notice_acknowledgments (user_id, notice_id, notice_version)
        VALUES ($1, $2, $3);
      `, [userId, notice2Id, '7.0']);

      // Verify both acknowledgments exist
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM privacy_notice_acknowledgments
        WHERE user_id = $1;
      `, [userId]);

      expect(parseInt(result.rows[0].count)).toBe(2);

      // Clean up
      await pool.query('DELETE FROM privacy_notice_acknowledgments WHERE user_id = $1', [userId]);
      await pool.query('DELETE FROM privacy_notices WHERE id IN ($1, $2)', [notice1Id, notice2Id]);
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    });

    it('should cascade delete acknowledgments when user is deleted', async () => {
      // Create test user
      const userResult = await pool.query(`
        INSERT INTO users (email, password_hash, role, name)
        VALUES ('cascade@example.com', 'hashed_password', 'Patient', 'Cascade User')
        RETURNING id;
      `);
      const userId = userResult.rows[0].id;

      // Create test privacy notice
      const noticeResult = await pool.query(`
        INSERT INTO privacy_notices (version, content, effective_date, sections)
        VALUES ('8.0', 'Test content', '2024-01-01', '{}')
        RETURNING id;
      `);
      const noticeId = noticeResult.rows[0].id;

      // Insert acknowledgment
      await pool.query(`
        INSERT INTO privacy_notice_acknowledgments (user_id, notice_id, notice_version)
        VALUES ($1, $2, $3);
      `, [userId, noticeId, '8.0']);

      // Delete user
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);

      // Verify acknowledgment was cascade deleted
      const result = await pool.query(`
        SELECT COUNT(*) as count
        FROM privacy_notice_acknowledgments
        WHERE user_id = $1;
      `, [userId]);

      expect(parseInt(result.rows[0].count)).toBe(0);

      // Clean up
      await pool.query('DELETE FROM privacy_notices WHERE id = $1', [noticeId]);
    });
  });
});
