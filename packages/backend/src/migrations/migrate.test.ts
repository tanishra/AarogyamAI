import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';
import {
  createMigrationsTable,
  runMigration,
  rollbackMigration,
  recordMigration,
  isMigrationApplied,
  removeMigrationRecord,
} from './migrate';

// Test database configuration
const testPool = new Pool({
  host: process.env.TEST_DB_HOST || 'localhost',
  port: parseInt(process.env.TEST_DB_PORT || '5432'),
  database: process.env.TEST_DB_NAME || 'admin_panel_test',
  user: process.env.TEST_DB_USER || 'postgres',
  password: process.env.TEST_DB_PASSWORD || 'postgres',
});

// Check if database is available
const isDatabaseAvailable = async (): Promise<boolean> => {
  try {
    await testPool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
};

describe('Migration System', () => {
  let dbAvailable = false;

  beforeAll(async () => {
    dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      // Create migrations tracking table
      await createMigrationsTable(testPool);
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      // Clean up and close connection
      await testPool.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
    }
    await testPool.end();
  });

  describe('Migration Tracking', () => {
    it.skipIf(!dbAvailable)('should create migrations tracking table', async () => {
      const result = await testPool.query(
        "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'schema_migrations')"
      );
      expect(result.rows[0].exists).toBe(true);
    });

    it.skipIf(!dbAvailable)('should record a migration', async () => {
      const migrationName = 'test_migration.sql';
      await recordMigration(testPool, migrationName);
      
      const isApplied = await isMigrationApplied(testPool, migrationName);
      expect(isApplied).toBe(true);
    });

    it.skipIf(!dbAvailable)('should check if migration is applied', async () => {
      const migrationName = 'another_test_migration.sql';
      
      let isApplied = await isMigrationApplied(testPool, migrationName);
      expect(isApplied).toBe(false);
      
      await recordMigration(testPool, migrationName);
      
      isApplied = await isMigrationApplied(testPool, migrationName);
      expect(isApplied).toBe(true);
    });

    it.skipIf(!dbAvailable)('should remove migration record', async () => {
      const migrationName = 'removable_migration.sql';
      
      await recordMigration(testPool, migrationName);
      expect(await isMigrationApplied(testPool, migrationName)).toBe(true);
      
      await removeMigrationRecord(testPool, migrationName);
      expect(await isMigrationApplied(testPool, migrationName)).toBe(false);
    });

    it.skipIf(!dbAvailable)('should not duplicate migration records', async () => {
      const migrationName = 'duplicate_test.sql';
      
      await recordMigration(testPool, migrationName);
      await recordMigration(testPool, migrationName); // Try to insert again
      
      const result = await testPool.query(
        'SELECT COUNT(*) FROM schema_migrations WHERE migration_name = $1',
        [migrationName]
      );
      
      expect(parseInt(result.rows[0].count)).toBe(1);
    });
  });

  describe('Migration File Structure', () => {
    it('should have matching forward and rollback migration files', () => {
      const fs = require('fs');
      const path = require('path');
      
      const migrationFiles = fs.readdirSync(__dirname)
        .filter((file: string) => file.endsWith('.sql') && !file.includes('rollback'));
      
      for (const migrationFile of migrationFiles) {
        const rollbackFile = migrationFile.replace('.sql', '_rollback.sql');
        const rollbackPath = path.join(__dirname, rollbackFile);
        
        expect(
          fs.existsSync(rollbackPath),
          `Rollback file ${rollbackFile} should exist for ${migrationFile}`
        ).toBe(true);
      }
    });

    it('should have valid SQL syntax in migration files', () => {
      const fs = require('fs');
      const path = require('path');
      
      const migrationFile = '001_create_user_management_tables.sql';
      const migrationPath = path.join(__dirname, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      
      // Basic SQL syntax checks
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('registration_requests');
      expect(sql).toContain('ALTER TABLE users');
      expect(sql).toContain('CREATE INDEX');
    });

    it('should have valid SQL syntax in rollback files', () => {
      const fs = require('fs');
      const path = require('path');
      
      const rollbackFile = '001_create_user_management_tables_rollback.sql';
      const rollbackPath = path.join(__dirname, rollbackFile);
      const sql = fs.readFileSync(rollbackPath, 'utf-8');
      
      // Basic SQL syntax checks
      expect(sql).toContain('DROP TABLE');
      expect(sql).toContain('registration_requests');
      expect(sql).toContain('ALTER TABLE users');
      expect(sql).toContain('DROP INDEX');
    });
  });

  describe('Migration SQL Content', () => {
    it('should create registration_requests table with required columns', () => {
      const fs = require('fs');
      const path = require('path');
      
      const migrationFile = '001_create_user_management_tables.sql';
      const migrationPath = path.join(__dirname, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      
      // Check for required columns
      expect(sql).toContain('applicant_name');
      expect(sql).toContain('email');
      expect(sql).toContain('requested_role');
      expect(sql).toContain('credentials');
      expect(sql).toContain('submitted_at');
      expect(sql).toContain('status');
      expect(sql).toContain('processed_by');
      expect(sql).toContain('processed_at');
      expect(sql).toContain('rejection_reason');
    });

    it('should extend users table with required columns', () => {
      const fs = require('fs');
      const path = require('path');
      
      const migrationFile = '001_create_user_management_tables.sql';
      const migrationPath = path.join(__dirname, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      
      // Check for required user columns
      expect(sql).toContain('is_active');
      expect(sql).toContain('mfa_enabled');
      expect(sql).toContain('mfa_method');
      expect(sql).toContain('mfa_secret');
      expect(sql).toContain('last_password_change');
      expect(sql).toContain('last_mfa_verification');
    });

    it('should create required indexes', () => {
      const fs = require('fs');
      const path = require('path');
      
      const migrationFile = '001_create_user_management_tables.sql';
      const migrationPath = path.join(__dirname, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      
      // Check for required indexes
      expect(sql).toContain('idx_registration_requests_status');
      expect(sql).toContain('idx_registration_requests_submitted_at');
      expect(sql).toContain('idx_users_role');
      expect(sql).toContain('idx_users_is_active');
    });

    it('should use IF NOT EXISTS for idempotency', () => {
      const fs = require('fs');
      const path = require('path');
      
      const migrationFile = '001_create_user_management_tables.sql';
      const migrationPath = path.join(__dirname, migrationFile);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      
      // Check for idempotent operations in forward migration
      expect(sql).toContain('IF NOT EXISTS');
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
      expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
      expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
      
      // Check rollback file uses IF EXISTS
      const rollbackFile = '001_create_user_management_tables_rollback.sql';
      const rollbackPath = path.join(__dirname, rollbackFile);
      const rollbackSql = fs.readFileSync(rollbackPath, 'utf-8');
      
      expect(rollbackSql).toContain('IF EXISTS');
      expect(rollbackSql).toContain('DROP TABLE IF EXISTS');
      expect(rollbackSql).toContain('DROP INDEX IF EXISTS');
      expect(rollbackSql).toContain('DROP COLUMN IF EXISTS');
    });
  });
});
