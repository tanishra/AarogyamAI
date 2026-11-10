import { Pool } from 'pg';
import {
  createMigrationsTable,
  runMigration,
  recordMigration,
} from '../migrations/migrate';
import { readdirSync } from 'fs';
import { join } from 'path';

const ADMIN_URL =
  process.env.TEST_DB_ADMIN_URL ||
  'postgresql://postgres:postgres@localhost:5432/postgres';
const TEST_DB_NAME = process.env.TEST_DB_NAME || 'admin_panel_test';

/**
 * Recreate the test database and apply every migration so each suite
 * run starts from a clean, fully-migrated schema.
 */
export default async function globalSetup(): Promise<void> {
  const admin = new Pool({ connectionString: ADMIN_URL });
  await admin.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [TEST_DB_NAME]
  );
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
  await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  await admin.end();

  const testUrl = ADMIN_URL.replace(/\/[^/]+$/, `/${TEST_DB_NAME}`);
  const pool = new Pool({ connectionString: testUrl });
  try {
    await createMigrationsTable(pool);
    const migrations = readdirSync(join(__dirname, '../migrations'))
      .filter((f) => f.endsWith('.sql') && !f.endsWith('_rollback.sql'))
      .sort();
    for (const file of migrations) {
      const result = await runMigration(pool, file);
      if (!result.success) {
        throw new Error(
          `Migration ${file} failed: ${result.error?.message}`
        );
      }
      await recordMigration(pool, file);
    }
  } finally {
    await pool.end();
  }
}
