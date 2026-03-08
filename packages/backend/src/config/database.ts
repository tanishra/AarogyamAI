import { Pool, PoolClient, PoolConfig } from 'pg';
import { config } from './index';

/**
 * PostgreSQL Connection Pool Configuration
 * 
 * Provides connection pooling for PostgreSQL database with health checks
 */

let pool: Pool | null = null;

/**
 * Create PostgreSQL connection pool
 */
export function createDatabasePool(): Pool {
  const poolConfig: PoolConfig = {
    connectionString: config.database.url,
    min: config.database.poolMin,
    max: config.database.poolMax,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false
    }
  };

  console.log('Connecting to database:', config.database.url);
  const newPool = new Pool(poolConfig);

  // Handle pool errors
  newPool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });

  return newPool;
}

/**
 * Get or create database pool instance (singleton)
 */
export function getDatabasePool(): Pool {
  if (!pool) {
    pool = createDatabasePool();
  }
  return pool;
}

/**
 * Close database pool
 */
export async function closeDatabasePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const dbPool = getDatabasePool();
    const result = await dbPool.query('SELECT 1 as health');
    return result.rows[0].health === 1;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}

/**
 * Execute a query with automatic connection management
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const dbPool = getDatabasePool();
  const result = await dbPool.query(text, params);
  return result.rows;
}

/**
 * Execute a transaction with automatic rollback on error
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const dbPool = getDatabasePool();
  const client = await dbPool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
