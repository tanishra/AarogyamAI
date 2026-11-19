import { beforeAll, afterAll, beforeEach } from 'vitest';
import dotenv from 'dotenv';

// Load test environment variables
beforeAll(() => {
  dotenv.config({ path: '.env.test' });
});

// Rate-limit + lockout counters live in Redis — flush them between tests so
// each test starts with a clean window regardless of run order.
beforeEach(async () => {
  try {
    const { getRedisClient } = await import('../config/redis');
    const client = getRedisClient();
    const keys = await client.keys('rl:*');
    const lockKeys = await client.keys('lockout:*');
    if (keys.length + lockKeys.length > 0) {
      await client.del(...keys, ...lockKeys);
    }
  } catch {
    // Redis unavailable — nothing to flush
  }
});

afterAll(() => {
  // Cleanup test resources if needed
});
