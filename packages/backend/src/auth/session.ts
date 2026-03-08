import { getRedisClient } from '../config/redis';
import { config } from '../config';

/**
 * Session Management
 * 
 * Implements session storage in Redis with 8-hour TTL
 */

export interface SessionData {
  userId: string;
  role: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';
  email: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface CreateSessionParams {
  userId: string;
  role: 'Patient' | 'Nurse' | 'Doctor' | 'Administrator' | 'DPO';
  email: string;
  ipAddress: string;
  userAgent: string;
}

/**
 * Generate session key for Redis
 */
function getSessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Generate user sessions key for Redis (to track all sessions for a user)
 */
function getUserSessionsKey(userId: string): string {
  return `user:${userId}:sessions`;
}

/**
 * Generate token blacklist key for Redis
 */
function getBlacklistKey(token: string): string {
  return `blacklist:${token}`;
}

/**
 * Create a new session
 */
export async function createSession(
  sessionId: string,
  params: CreateSessionParams
): Promise<SessionData> {
  const redis = getRedisClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + config.security.sessionTTL * 1000);

  const sessionData: SessionData = {
    userId: params.userId,
    role: params.role,
    email: params.email,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
    createdAt: now,
    expiresAt,
  };

  const sessionKey = getSessionKey(sessionId);
  const userSessionsKey = getUserSessionsKey(params.userId);

  // Store session data with TTL
  await redis.setex(
    sessionKey,
    config.security.sessionTTL,
    JSON.stringify(sessionData)
  );

  // Add session ID to user's session set with TTL
  await redis.sadd(userSessionsKey, sessionId);
  await redis.expire(userSessionsKey, config.security.sessionTTL);

  return sessionData;
}

/**
 * Get session data
 */
export async function getSession(sessionId: string): Promise<SessionData | null> {
  const redis = getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  const data = await redis.get(sessionKey);
  if (!data) {
    return null;
  }

  const sessionData = JSON.parse(data) as SessionData;
  
  // Convert date strings back to Date objects
  sessionData.createdAt = new Date(sessionData.createdAt);
  sessionData.expiresAt = new Date(sessionData.expiresAt);

  return sessionData;
}

/**
 * Invalidate a specific session
 */
export async function invalidateSession(sessionId: string): Promise<void> {
  const redis = getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  // Get session data to find user ID
  const sessionData = await getSession(sessionId);
  if (sessionData) {
    const userSessionsKey = getUserSessionsKey(sessionData.userId);
    await redis.srem(userSessionsKey, sessionId);
  }

  // Delete session
  await redis.del(sessionKey);
}

/**
 * Invalidate all sessions for a user
 */
export async function invalidateUserSessions(userId: string): Promise<number> {
  const redis = getRedisClient();
  const userSessionsKey = getUserSessionsKey(userId);

  // Get all session IDs for the user
  const sessionIds = await redis.smembers(userSessionsKey);

  if (sessionIds.length === 0) {
    return 0;
  }

  // Delete all sessions
  const sessionKeys = sessionIds.map(id => getSessionKey(id));
  await redis.del(...sessionKeys);

  // Clear the user sessions set
  await redis.del(userSessionsKey);

  return sessionIds.length;
}

/**
 * Refresh session TTL
 */
export async function refreshSession(sessionId: string): Promise<boolean> {
  const redis = getRedisClient();
  const sessionKey = getSessionKey(sessionId);

  // Check if session exists
  const exists = await redis.exists(sessionKey);
  if (!exists) {
    return false;
  }

  // Get session data
  const sessionData = await getSession(sessionId);
  if (!sessionData) {
    return false;
  }

  // Update expiration time
  const newExpiresAt = new Date(Date.now() + config.security.sessionTTL * 1000);
  sessionData.expiresAt = newExpiresAt;

  // Update session with new TTL
  await redis.setex(
    sessionKey,
    config.security.sessionTTL,
    JSON.stringify(sessionData)
  );

  // Refresh user sessions set TTL
  const userSessionsKey = getUserSessionsKey(sessionData.userId);
  await redis.expire(userSessionsKey, config.security.sessionTTL);

  return true;
}

/**
 * Check if a token is blacklisted
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const redis = getRedisClient();
  const blacklistKey = getBlacklistKey(token);
  const exists = await redis.exists(blacklistKey);
  return exists === 1;
}

/**
 * Blacklist a token (for logout)
 */
export async function blacklistToken(token: string, expiresIn: number): Promise<void> {
  const redis = getRedisClient();
  const blacklistKey = getBlacklistKey(token);
  
  // Store token in blacklist with TTL matching token expiration
  await redis.setex(blacklistKey, expiresIn, '1');
}

/**
 * Get all active sessions for a user
 */
export async function getUserSessions(userId: string): Promise<SessionData[]> {
  const redis = getRedisClient();
  const userSessionsKey = getUserSessionsKey(userId);

  const sessionIds = await redis.smembers(userSessionsKey);
  
  if (sessionIds.length === 0) {
    return [];
  }

  const sessions: SessionData[] = [];
  for (const sessionId of sessionIds) {
    const sessionData = await getSession(sessionId);
    if (sessionData) {
      sessions.push(sessionData);
    }
  }

  return sessions;
}

/**
 * Count active sessions for a user
 */
export async function countUserSessions(userId: string): Promise<number> {
  const redis = getRedisClient();
  const userSessionsKey = getUserSessionsKey(userId);
  return await redis.scard(userSessionsKey);
}
