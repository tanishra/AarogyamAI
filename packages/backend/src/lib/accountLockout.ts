import { getRedisClient } from '../config/redis';
import { logger } from './logger';

/**
 * Account lockout — after MAX_FAILED_ATTEMPTS consecutive failed logins for
 * an email, the account is locked for LOCKOUT_SECONDS. Counters live in
 * Redis so the policy holds across instances and restarts.
 */

export const LOCKOUT_MAX_ATTEMPTS = 5;
export const LOCKOUT_SECONDS = 15 * 60;
const COUNTER_TTL_SECONDS = 30 * 60;

const counterKey = (email: string) => `lockout:count:${email.toLowerCase()}`;
const lockKey = (email: string) => `lockout:lock:${email.toLowerCase()}`;

/** Returns seconds remaining on the lock, or 0 when not locked. */
export async function getLockSeconds(email: string): Promise<number> {
  try {
    const ttl = await getRedisClient().ttl(lockKey(email));
    return ttl > 0 ? ttl : 0;
  } catch (err) {
    logger.error('Lockout check failed (fail-open):', err);
    return 0;
  }
}

/** Record a failed attempt; returns lock seconds if this attempt locked the account. */
export async function recordFailedAttempt(email: string): Promise<number> {
  try {
    const client = getRedisClient();
    const count = await client.incr(counterKey(email));
    if (count === 1) {
      await client.expire(counterKey(email), COUNTER_TTL_SECONDS);
    }
    if (count >= LOCKOUT_MAX_ATTEMPTS) {
      await client.set(lockKey(email), '1', 'EX', LOCKOUT_SECONDS);
      await client.del(counterKey(email));
      logger.warn('Account locked after failed logins', { email });
      return LOCKOUT_SECONDS;
    }
    return 0;
  } catch (err) {
    logger.error('Lockout counter failed (fail-open):', err);
    return 0;
  }
}

export async function clearAttempts(email: string): Promise<void> {
  try {
    await getRedisClient().del(counterKey(email), lockKey(email));
  } catch (err) {
    logger.error('Lockout clear failed:', err);
  }
}
