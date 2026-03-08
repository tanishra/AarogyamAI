/**
 * Tests for encryption_keys table migration
 * Requirements: 15.1, 15.4
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('Encryption Keys Table Migration', () => {
  let pool: Pool;

  beforeAll(async () => {
    // Create a test database connection
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://tanishrajput:@localhost:5432/clinical_ai_dev',
    });

    // Run the migration
    const migrationSQL = readFileSync(
      join(__dirname, '007_create_encryption_keys_table.sql'),
      'utf-8'
    );
    await pool.query(migrationSQL);
  });

  afterAll(async () => {
    // Clean up - run rollback
    const rollbackSQL = readFileSync(
      join(__dirname, '007_create_encryption_keys_table_rollback.sql'),
      'utf-8'
    );
    await pool.query(rollbackSQL);
    await pool.end();
  });

  it('should create encryption_keys table with all required columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'encryption_keys'
      ORDER BY ordinal_position;
    `);

    const columns = result.rows.map(row => row.column_name);
    
    // Verify all required columns exist
    expect(columns).toContain('id');
    expect(columns).toContain('key_id');
    expect(columns).toContain('algorithm');
    expect(columns).toContain('status');
    expect(columns).toContain('created_at');
    expect(columns).toContain('rotation_date');
    expect(columns).toContain('retired_at');
    expect(columns).toContain('metadata');
  });

  it('should create required indexes for performance', async () => {
    const result = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'encryption_keys';
    `);

    const indexes = result.rows.map(row => row.indexname);
    
    // Verify all required indexes exist
    expect(indexes).toContain('idx_encryption_keys_key_id');
    expect(indexes).toContain('idx_encryption_keys_status');
    expect(indexes).toContain('idx_encryption_keys_rotation_date');
    expect(indexes).toContain('idx_encryption_keys_active');
  });

  it('should have unique constraint on key_id', async () => {
    const result = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_name = 'encryption_keys'
        AND constraint_type = 'UNIQUE';
    `);

    const uniqueConstraints = result.rows.map(row => row.constraint_name);
    expect(uniqueConstraints.some(name => name.includes('key_id'))).toBe(true);
  });

  it('should enforce status check constraint', async () => {
    // Try to insert an invalid status
    await expect(
      pool.query(`
        INSERT INTO encryption_keys (key_id, algorithm, status, rotation_date)
        VALUES ('test-key-invalid', 'AES-256-GCM', 'invalid_status', NOW() + INTERVAL '90 days');
      `)
    ).rejects.toThrow();
  });

  it('should allow inserting a valid encryption key record', async () => {
    const result = await pool.query(`
      INSERT INTO encryption_keys (
        key_id,
        algorithm,
        status,
        rotation_date
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '90 days')
      RETURNING id, key_id, algorithm, status, created_at, rotation_date;
    `, [
      'test-key-001',
      'AES-256-GCM',
      'active'
    ]);

    expect(result.rows[0].key_id).toBe('test-key-001');
    expect(result.rows[0].algorithm).toBe('AES-256-GCM');
    expect(result.rows[0].status).toBe('active');
    expect(result.rows[0].created_at).not.toBeNull();
    expect(result.rows[0].rotation_date).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM encryption_keys WHERE key_id = $1', ['test-key-001']);
  });

  it('should support all valid status values', async () => {
    const statuses = ['active', 'rotating', 'retired'];
    
    for (const status of statuses) {
      const result = await pool.query(`
        INSERT INTO encryption_keys (
          key_id,
          algorithm,
          status,
          rotation_date
        )
        VALUES ($1, $2, $3, NOW() + INTERVAL '90 days')
        RETURNING status;
      `, [`test-key-${status}`, 'AES-256-GCM', status]);

      expect(result.rows[0].status).toBe(status);
    }

    // Clean up
    await pool.query('DELETE FROM encryption_keys WHERE key_id LIKE $1', ['test-key-%']);
  });

  it('should track key rotation dates', async () => {
    const rotationDate = new Date();
    rotationDate.setDate(rotationDate.getDate() + 90); // 90 days from now

    const result = await pool.query(`
      INSERT INTO encryption_keys (
        key_id,
        algorithm,
        status,
        rotation_date
      )
      VALUES ($1, $2, $3, $4)
      RETURNING rotation_date;
    `, [
      'test-key-rotation',
      'AES-256-GCM',
      'active',
      rotationDate
    ]);

    const storedRotationDate = new Date(result.rows[0].rotation_date);
    
    // Check that the rotation date is approximately 90 days from now
    const daysDifference = Math.abs(
      (storedRotationDate.getTime() - rotationDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    expect(daysDifference).toBeLessThan(1); // Within 1 day

    // Clean up
    await pool.query('DELETE FROM encryption_keys WHERE key_id = $1', ['test-key-rotation']);
  });

  it('should support key retirement tracking', async () => {
    // Insert an active key
    const insertResult = await pool.query(`
      INSERT INTO encryption_keys (
        key_id,
        algorithm,
        status,
        rotation_date
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '90 days')
      RETURNING id;
    `, ['test-key-retire', 'AES-256-GCM', 'active']);

    const keyId = insertResult.rows[0].id;

    // Retire the key
    await pool.query(`
      UPDATE encryption_keys
      SET status = 'retired',
          retired_at = NOW()
      WHERE id = $1;
    `, [keyId]);

    const result = await pool.query(`
      SELECT status, retired_at
      FROM encryption_keys
      WHERE id = $1;
    `, [keyId]);

    expect(result.rows[0].status).toBe('retired');
    expect(result.rows[0].retired_at).not.toBeNull();

    // Clean up
    await pool.query('DELETE FROM encryption_keys WHERE id = $1', [keyId]);
  });

  it('should store metadata as JSONB', async () => {
    const metadata = {
      kms_provider: 'AWS KMS',
      region: 'us-east-1',
      key_arn: 'arn:aws:kms:us-east-1:123456789012:key/12345678-1234-1234-1234-123456789012'
    };

    const result = await pool.query(`
      INSERT INTO encryption_keys (
        key_id,
        algorithm,
        status,
        rotation_date,
        metadata
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '90 days', $4)
      RETURNING metadata;
    `, [
      'test-key-metadata',
      'AES-256-GCM',
      'active',
      JSON.stringify(metadata)
    ]);

    expect(result.rows[0].metadata).toEqual(metadata);

    // Clean up
    await pool.query('DELETE FROM encryption_keys WHERE key_id = $1', ['test-key-metadata']);
  });

  it('should default algorithm to AES-256-GCM', async () => {
    const result = await pool.query(`
      INSERT INTO encryption_keys (
        key_id,
        status,
        rotation_date
      )
      VALUES ($1, $2, NOW() + INTERVAL '90 days')
      RETURNING algorithm;
    `, ['test-key-default-algo', 'active']);

    expect(result.rows[0].algorithm).toBe('AES-256-GCM');

    // Clean up
    await pool.query('DELETE FROM encryption_keys WHERE key_id = $1', ['test-key-default-algo']);
  });

  it('should query active keys efficiently using partial index', async () => {
    // Insert multiple keys with different statuses
    await pool.query(`
      INSERT INTO encryption_keys (key_id, status, rotation_date)
      VALUES 
        ('active-key-1', 'active', NOW() + INTERVAL '90 days'),
        ('active-key-2', 'active', NOW() + INTERVAL '90 days'),
        ('retired-key-1', 'retired', NOW() + INTERVAL '90 days'),
        ('rotating-key-1', 'rotating', NOW() + INTERVAL '90 days');
    `);

    // Query active keys
    const result = await pool.query(`
      SELECT key_id, status
      FROM encryption_keys
      WHERE status = 'active'
      ORDER BY key_id;
    `);

    expect(result.rows.length).toBe(2);
    expect(result.rows[0].key_id).toBe('active-key-1');
    expect(result.rows[1].key_id).toBe('active-key-2');

    // Clean up
    await pool.query(`
      DELETE FROM encryption_keys 
      WHERE key_id IN ('active-key-1', 'active-key-2', 'retired-key-1', 'rotating-key-1');
    `);
  });

  it('should identify keys due for rotation', async () => {
    // Insert keys with different rotation dates
    await pool.query(`
      INSERT INTO encryption_keys (key_id, status, rotation_date)
      VALUES 
        ('key-due-rotation', 'active', NOW() - INTERVAL '1 day'),
        ('key-future-rotation', 'active', NOW() + INTERVAL '30 days');
    `);

    // Query keys due for rotation
    const result = await pool.query(`
      SELECT key_id
      FROM encryption_keys
      WHERE status = 'active'
        AND rotation_date <= NOW()
      ORDER BY rotation_date;
    `);

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].key_id).toBe('key-due-rotation');

    // Clean up
    await pool.query(`
      DELETE FROM encryption_keys 
      WHERE key_id IN ('key-due-rotation', 'key-future-rotation');
    `);
  });
});
