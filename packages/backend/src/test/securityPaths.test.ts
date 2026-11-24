import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import app from '../index';
import { getDatabasePool } from '../config/database';
import { llmService } from '../services/LLMService';

// Force every OpenAI provider call to reject — the test exercises the
// circuit-breaker + fixed-fallback chain, not the provider.
vi.mock('openai', () => {
  const create = vi.fn(async () => {
    throw new Error('provider down (test)');
  });
  return {
    default: vi.fn(function (this: any) {
      this.chat = { completions: { create } };
    }),
  };
});

/**
 * Security-path E2E — real app, real Postgres, real Redis.
 * Covers the failure paths the happy-path E2E never touches:
 * account lockout, refresh-token replay, auth rate limiting, and the
 * LLM circuit-breaker/fallback chain.
 */
describe('Security paths (E2E)', () => {
  const pool = getDatabasePool();
  const suffix = Date.now().toString(36);
  const password = 'secpath-password-12345';
  const email = `secpath-${suffix}@test.local`;

  let accessToken = '';
  let sessionId = '';
  let userId = '';
  const chatSessionIds: string[] = [];

  const signup = async (mail: string) => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Sec Path', email: mail, password, role: 'Patient' });
    expect(res.status).toBe(201);
    return res.body.data;
  };

  const login = async (mail: string, pass: string) =>
    request(app).post('/api/auth/login').send({ email: mail, password: pass });

  beforeAll(async () => {
    const data = await signup(email);
    accessToken = data.accessToken;
    sessionId = data.sessionId;
    userId = data.user.id;
  });

  afterAll(async () => {
    for (const id of chatSessionIds) {
      await pool.query('DELETE FROM chat_messages WHERE session_id = $1', [id]);
      await pool.query('DELETE FROM chat_sessions WHERE id = $1', [id]);
    }
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
  });

  it('locks the account after 5 failed logins, then rejects even the right password', async () => {
    const mail = `lock-${suffix}@test.local`;
    const data = await signup(mail);
    try {
      for (let i = 0; i < 5; i++) {
        const res = await login(mail, 'wrong-password');
        expect(res.status).toBe(401);
      }

      // Account is now locked — correct credentials are refused too
      const locked = await login(mail, password);
      expect(locked.status).toBe(429);
      expect(locked.body.retryAfter).toBeGreaterThan(0);
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [data.user.id]);
    }
  });

  it('rejects a rotated refresh token on replay (401)', async () => {
    const res = await login(email, password);
    expect(res.status).toBe(200);
    const refreshToken = res.body.data.refreshToken;

    const rotated = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.refreshToken).not.toBe(refreshToken);

    const replay = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken });
    expect(replay.status).toBe(401);

    // The rotated token itself still works
    const valid = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: rotated.body.data.refreshToken });
    expect(valid.status).toBe(200);
  });

  it('returns 429 once the auth rate limit is exceeded', async () => {
    let saw429 = false;
    for (let i = 0; i < 15 && !saw429; i++) {
      const res = await login(`missing-${i}-${suffix}@test.local`, 'x');
      if (res.status === 429) saw429 = true;
    }
    expect(saw429).toBe(true);
  });

  it('serves the fixed safe response when the LLM provider is down (circuit + fallback)', async () => {
    const start = await request(app)
      .post('/api/patient/chat/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-session-id', sessionId)
      .send({ patientId: userId });
    expect(start.status).toBe(201);
    const chatSessionId = start.body.data.sessionId as string;
    chatSessionIds.push(chatSessionId);

    // Every provider call rejects → after 3 failures the circuit opens;
    // each chat response is the fixed safe message, never an error or
    // unfiltered provider output.
    let last;
    for (let i = 0; i < 4; i++) {
      last = await request(app)
        .post('/api/patient/chat/message')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('x-session-id', sessionId)
        .send({ sessionId: chatSessionId, message: `symptom ${i}` });
      expect(last.status).toBe(200);
      expect(last.body.data.response).toContain('noting it down for the doctor');
    }

    expect(llmService.isDegraded()).toBe(true);

    const readyz = await request(app).get('/readyz');
    expect(readyz.body.checks.llm).toBe('degraded');
  });
});
