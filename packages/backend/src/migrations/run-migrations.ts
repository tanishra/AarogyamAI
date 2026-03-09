#!/usr/bin/env node

/**
 * Migration CLI Tool
 * 
 * Usage:
 *   npm run migrate up              - Run all pending migrations
 *   npm run migrate down <name>     - Rollback a specific migration
 *   npm run migrate status          - Show migration status
 */

import { Pool } from 'pg';
import {
  createMigrationsTable,
  runMigration,
  rollbackMigration,
  recordMigration,
  removeMigrationRecord,
  isMigrationApplied,
} from './migrate';

// Database configuration from environment variables
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'admin_panel',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl: process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('rds.amazonaws.com') ? {
    rejectUnauthorized: false
  } : undefined
});

const MIGRATIONS = [
  '001_create_user_management_tables.sql',
  '002_create_consent_grievance_tables.sql',
  '003_create_ai_chat_tables.sql',
  '004_create_mfa_configurations_table.sql',
  // Add more migrations here as they are created
];

async function runUp() {
  console.log('Running migrations...\n');
  
  await createMigrationsTable(pool);
  
  let appliedCount = 0;
  
  for (const migration of MIGRATIONS) {
    const isApplied = await isMigrationApplied(pool, migration);
    
    if (isApplied) {
      console.log(`✓ ${migration} (already applied)`);
      continue;
    }
    
    console.log(`→ Running ${migration}...`);
    const result = await runMigration(pool, migration);
    
    if (result.success) {
      await recordMigration(pool, migration);
      console.log(`✓ ${migration} (applied successfully)\n`);
      appliedCount++;
    } else {
      console.error(`✗ ${migration} (failed)`);
      console.error(`  Error: ${result.error?.message}\n`);
      break;
    }
  }
  
  if (appliedCount === 0) {
    console.log('No new migrations to apply.');
  } else {
    console.log(`\nApplied ${appliedCount} migration(s) successfully.`);
  }
}

async function runDown(migrationName: string) {
  console.log(`Rolling back migration: ${migrationName}\n`);
  
  const isApplied = await isMigrationApplied(pool, migrationName);
  
  if (!isApplied) {
    console.log(`Migration ${migrationName} has not been applied.`);
    return;
  }
  
  console.log(`→ Rolling back ${migrationName}...`);
  const result = await rollbackMigration(pool, migrationName);
  
  if (result.success) {
    await removeMigrationRecord(pool, migrationName);
    console.log(`✓ ${migrationName} (rolled back successfully)\n`);
  } else {
    console.error(`✗ ${migrationName} (rollback failed)`);
    console.error(`  Error: ${result.error?.message}\n`);
  }
}

async function showStatus() {
  console.log('Migration Status:\n');
  
  await createMigrationsTable(pool);
  
  for (const migration of MIGRATIONS) {
    const isApplied = await isMigrationApplied(pool, migration);
    const status = isApplied ? '✓ Applied' : '○ Pending';
    console.log(`${status}  ${migration}`);
  }
}

async function main() {
  const command = process.argv[2];
  const arg = process.argv[3];
  
  try {
    switch (command) {
      case 'up':
        await runUp();
        break;
      case 'down':
        if (!arg) {
          console.error('Error: Please specify a migration name to rollback');
          process.exit(1);
        }
        await runDown(arg);
        break;
      case 'status':
        await showStatus();
        break;
      default:
        console.log('Usage:');
        console.log('  npm run migrate up              - Run all pending migrations');
        console.log('  npm run migrate down <name>     - Rollback a specific migration');
        console.log('  npm run migrate status          - Show migration status');
        process.exit(1);
    }
  } catch (error) {
    console.error('Migration error:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
