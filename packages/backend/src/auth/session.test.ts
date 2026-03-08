import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createSession,
  getSession,
  invalidateSession,
  invalidateUserSessions,
  refreshSession,
  blacklistToken,
  isTokenBlacklisted,
  getUserSessions,
  countUserSessions,
  CreateSessionParams,
} from './session';
import { getRedisClient, connectRedis, closeRedisClient } from '../config/redis';

describe('Session Management', () => {
  beforeEach(async () => {
    await connectRedis();
    // Clear test data
    const redis = getRedisClient();
    const keys = await redis.keys('session:*');
    const userKeys = await redis.keys('user:*:sessions');
    const blacklistKeys = await redis.keys('blacklist:*');
    if (keys.length > 0) await redis.del(...keys);
    if (userKeys.length > 0) await redis.del(...userKeys);
    if (blacklistKeys.length > 0) await redis.del(...blacklistKeys);
  });

  afterEach(async () => {
    // Cleanup
    const redis = getRedisClient();
    const keys = await redis.keys('session:*');
    const userKeys = await redis.keys('user:*:sessions');
    const blacklistKeys = await redis.keys('blacklist:*');
    if (keys.length > 0) await redis.del(...keys);
    if (userKeys.length > 0) await redis.del(...userKeys);
    if (blacklistKeys.length > 0) await redis.del(...blacklistKeys);
  });

  const testSessionParams: CreateSessionParams = {
    userId: 'user-123',
    role: 'Administrator',
    email: 'admin@example.com',
    ipAddress: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
  };

  describe('createSession', () => {
    it('should create a new session', async () => {
      const sessionId = 'session-123';
      const session = await createSession(sessionId, testSessionParams);

      expect(session.userId).toBe(testSessionParams.userId);
      expect(session.role).toBe(testSessionParams.role);
      expect(session.email).toBe(testSessionParams.email);
      expect(session.ipAddress).toBe(testSessionParams.ipAddress);
      expect(session.userAgent).toBe(testSessionParams.userAgent);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.expiresAt).toBeInstanceOf(Date);
    });

    it('should store session in Redis', async () => {
      const sessionId = 'session-456';
      await createSession(sessionId, testSessionParams);

      const retrieved = await getSession(sessionId);
      expect(retrieved).toBeTruthy();
      expect(retrieved?.userId).toBe(testSessionParams.userId);
    });

    it('should add session to user sessions set', async () => {
      const sessionId = 'session-789';
      await createSession(sessionId, testSessionParams);

      const count = await countUserSessions(testSessionParams.userId);
      expect(count).toBe(1);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session', async () => {
      const sessionId = 'session-get-1';
      await createSession(sessionId, testSessionParams);

      const session = await getSession(sessionId);
      expect(session).toBeTruthy();
      expect(session?.userId).toBe(testSessionParams.userId);
    });

    it('should return null for non-existent session', async () => {
      const session = await getSession('non-existent-session');
      expect(session).toBeNull();
    });

    it('should parse dates correctly', async () => {
      const sessionId = 'session-dates';
      await createSession(sessionId, testSessionParams);

      const session = await getSession(sessionId);
      expect(session?.createdAt).toBeInstanceOf(Date);
      expect(session?.expiresAt).toBeInstanceOf(Date);
    });
  });

  describe('invalidateSession', () => {
    it('should delete a session', async () => {
      const sessionId = 'session-invalidate-1';
      await createSession(sessionId, testSessionParams);

      await invalidateSession(sessionId);

      const session = await getSession(sessionId);
      expect(session).toBeNull();
    });

    it('should remove session from user sessions set', async () => {
      const sessionId = 'session-invalidate-2';
      await createSession(sessionId, testSessionParams);

      await invalidateSession(sessionId);

      const count = await countUserSessions(testSessionParams.userId);
      expect(count).toBe(0);
    });

    it('should handle invalidating non-existent session', async () => {
      await expect(invalidateSession('non-existent')).resolves.not.toThrow();
    });
  });

  describe('invalidateUserSessions', () => {
    it('should invalidate all sessions for a user', async () => {
      const sessionIds = ['session-user-1', 'session-user-2', 'session-user-3'];
      
      for (const sessionId of sessionIds) {
        await createSession(sessionId, testSessionParams);
      }

      const count = await invalidateUserSessions(testSessionParams.userId);
      expect(count).toBe(3);

      // Verify all sessions are deleted
      for (const sessionId of sessionIds) {
        const session = await getSession(sessionId);
        expect(session).toBeNull();
      }
    });

    it('should return 0 for user with no sessions', async () => {
      const count = await invalidateUserSessions('user-no-sessions');
      expect(count).toBe(0);
    });
  });

  describe('refreshSession', () => {
    it('should refresh an existing session', async () => {
      const sessionId = 'session-refresh-1';
      const originalSession = await createSession(sessionId, testSessionParams);

      // Wait a bit to ensure time difference
      await new Promise(resolve => setTimeout(resolve, 100));

      const refreshed = await refreshSession(sessionId);
      expect(refreshed).toBe(true);

      const updatedSession = await getSession(sessionId);
      expect(updatedSession?.expiresAt.getTime()).toBeGreaterThan(
        originalSession.expiresAt.getTime()
      );
    });

    it('should return false for non-existent session', async () => {
      const refreshed = await refreshSession('non-existent-session');
      expect(refreshed).toBe(false);
    });
  });

  describe('Token blacklist', () => {
    it('should blacklist a token', async () => {
      const token = 'test-token-123';
      await blacklistToken(token, 3600);

      const isBlacklisted = await isTokenBlacklisted(token);
      expect(isBlacklisted).toBe(true);
    });

    it('should return false for non-blacklisted token', async () => {
      const isBlacklisted = await isTokenBlacklisted('non-blacklisted-token');
      expect(isBlacklisted).toBe(false);
    });
  });

  describe('getUserSessions', () => {
    it('should return all sessions for a user', async () => {
      const sessionIds = ['session-list-1', 'session-list-2'];
      
      for (const sessionId of sessionIds) {
        await createSession(sessionId, testSessionParams);
      }

      const sessions = await getUserSessions(testSessionParams.userId);
      expect(sessions).toHaveLength(2);
      expect(sessions.every(s => s.userId === testSessionParams.userId)).toBe(true);
    });

    it('should return empty array for user with no sessions', async () => {
      const sessions = await getUserSessions('user-no-sessions');
      expect(sessions).toEqual([]);
    });
  });

  describe('countUserSessions', () => {
    it('should count user sessions correctly', async () => {
      const sessionIds = ['session-count-1', 'session-count-2', 'session-count-3'];
      
      for (const sessionId of sessionIds) {
        await createSession(sessionId, testSessionParams);
      }

      const count = await countUserSessions(testSessionParams.userId);
      expect(count).toBe(3);
    });

    it('should return 0 for user with no sessions', async () => {
      const count = await countUserSessions('user-no-sessions');
      expect(count).toBe(0);
    });
  });

  describe('Multiple users', () => {
    it('should handle sessions for different users independently', async () => {
      const user1Params = { ...testSessionParams, userId: 'user-1' };
      const user2Params = { ...testSessionParams, userId: 'user-2' };

      await createSession('session-user1-1', user1Params);
      await createSession('session-user1-2', user1Params);
      await createSession('session-user2-1', user2Params);

      const user1Count = await countUserSessions('user-1');
      const user2Count = await countUserSessions('user-2');

      expect(user1Count).toBe(2);
      expect(user2Count).toBe(1);

      // Invalidate user1 sessions
      await invalidateUserSessions('user-1');

      const user1CountAfter = await countUserSessions('user-1');
      const user2CountAfter = await countUserSessions('user-2');

      expect(user1CountAfter).toBe(0);
      expect(user2CountAfter).toBe(1); // User2 sessions unaffected
    });
  });
});
