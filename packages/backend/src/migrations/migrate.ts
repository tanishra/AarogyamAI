/**
 * Database Migration Runner
 * 
 * This utility provides functions to run and rollback database migrations.
 * Migrations are executed in order based on their numeric prefix.
 */

import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

export interface MigrationResult {
  success: boolean;
  migration: string;
  error?: Error;
}

/**
 * Run a specific migration file
 */
export async function runMigration(
  pool: Pool,
  migrationFile: string
): Promise<MigrationResult> {
  try {
    const migrationPath = join(__dirname, migrationFile);
    const sql = readFileSync(migrationPath, 'utf-8');
    
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('COMMIT');
    
    return {
      success: true,
      migration: migrationFile,
    };
  } catch (error) {
    await pool.query('ROLLBACK');
    return {
      success: false,
      migration: migrationFile,
      error: error as Error,
    };
  }
}

/**
 * Run all migrations in order
 */
export async function runAllMigrations(pool: Pool): Promise<MigrationResult[]> {
  const migrations = readdirSync(__dirname)
    .filter((file) => file.endsWith('.sql') && !file.endsWith('_rollback.sql'))
    .sort();
  
  const results: MigrationResult[] = [];
  
  for (const migration of migrations) {
    const result = await runMigration(pool, migration);
    results.push(result);
    
    if (!result.success) {
      console.error(`Migration ${migration} failed:`, result.error);
      break; // Stop on first failure
    }
  }
  
  return results;
}

/**
 * Rollback a specific migration
 */
export async function rollbackMigration(
  pool: Pool,
  migrationFile: string
): Promise<MigrationResult> {
  try {
    const rollbackFile = migrationFile.replace('.sql', '_rollback.sql');
    const migrationPath = join(__dirname, rollbackFile);
    const sql = readFileSync(migrationPath, 'utf-8');
    
    await pool.query('BEGIN');
    await pool.query(sql);
    await pool.query('COMMIT');
    
    return {
      success: true,
      migration: rollbackFile,
    };
  } catch (error) {
    await pool.query('ROLLBACK');
    return {
      success: false,
      migration: migrationFile,
      error: error as Error,
    };
  }
}

/**
 * Create a migrations tracking table
 */
export async function createMigrationsTable(pool: Pool): Promise<void> {
  const sql = `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
  
  await pool.query(sql);
}

/**
 * Record a migration as applied
 */
export async function recordMigration(
  pool: Pool,
  migrationName: string
): Promise<void> {
  await pool.query(
    'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO NOTHING',
    [migrationName]
  );
}

/**
 * Check if a migration has been applied
 */
export async function isMigrationApplied(
  pool: Pool,
  migrationName: string
): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM schema_migrations WHERE migration_name = $1',
    [migrationName]
  );
  
  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Remove a migration record
 */
export async function removeMigrationRecord(
  pool: Pool,
  migrationName: string
): Promise<void> {
  await pool.query(
    'DELETE FROM schema_migrations WHERE migration_name = $1',
    [migrationName]
  );
}
