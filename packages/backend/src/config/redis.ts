import Redis, { RedisOptions } from 'ioredis';
import { config } from './index';

/**
 * Redis Client Configuration
 * 
 * Provides Redis client for session management and caching
 */

let redisClient: Redis | null = null;

/**
 * Create Redis client
 */
export function createRedisClient(): Redis {
  const options: RedisOptions = {
    lazyConnect: true,
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  };

  // Parse Redis URL or use individual config
  if (config.redis.url) {
    const client = new Redis(config.redis.url, options);
    
    // Handle connection events
    client.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    client.on('connect', () => {
      console.log('Redis client connected');
    });

    return client;
  }

  throw new Error('Redis URL not configured');
}

/**
 * Get or create Redis client instance (singleton)
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
}

/**
 * Close Redis client
 */
export async function closeRedisClient(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Check Redis connection health
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const result = await client.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

/**
 * Connect to Redis (for lazy connection)
 */
export async function connectRedis(): Promise<void> {
  const client = getRedisClient();
  if (client.status !== 'ready') {
    await client.connect();
  }
}
