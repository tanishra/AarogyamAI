import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index';
import { getDatabasePool } from '../config/database';

/**
 * Session management — real app, real Redis.
 * Signup creates a session; two logins create two more. Exercises:
 * list, current-marker via x-session-id, ownership check, single revoke,
 * revoke-others preserving the current session.
 */
describe('Session management', () => {
  const pool = getDatabasePool();
  const suffix = Date.now().toString(36);
  const user = {
    name: 'Session Tester',
    email: `sess-${suffix}@test.local`,
    password: 'sess-password-12345',
    role: 'Patient',
  };

  let userId: string;
  const logins: { token: string; sessionId: string }[] = [];

  const login = async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: user.email, password: user.password });
    expect(res.status).toBe(200);
    return { token: res.body.data.accessToken, sessionId: res.body.data.sessionId as string };
  };

  beforeAll(async () => {
    const res = await request(app).post('/api/auth/signup').send(user);
    expect(res.status).toBe(201);
    userId = res.body.data.user.id;
    logins.push({ token: res.body.data.accessToken, sessionId: res.body.data.sessionId });
    logins.push(await login());
    logins.push(await login());
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  });

  it('lists all active sessions', async () => {
    const res = await request(app)
      .get('/api/auth/sessions')
      .set({ Authorization: `Bearer ${logins[0].token}` });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    expect(res.body.count).toBe(res.body.data.length);
  });

  it('marks the current session from x-session-id', async () => {
    const res = await request(app)
      .get('/api/auth/sessions')
      .set({ Authorization: `Bearer ${logins[1].token}`, 'x-session-id': logins[1].sessionId });
    expect(res.status).toBe(200);
    const current = res.body.data.filter((s: { sessionId: string; current?: boolean }) => s.current);
    expect(current).toHaveLength(1);
    expect(current[0].sessionId).toBe(logins[1].sessionId);
  });

  it('rejects revoking a session owned by another user', async () => {
    const res = await request(app)
      .delete('/api/auth/sessions/nonexistent-session-id')
      .set({ Authorization: `Bearer ${logins[0].token}` });
    expect(res.status).toBe(404);
  });

  it('revokes a single owned session', async () => {
    const res = await request(app)
      .delete(`/api/auth/sessions/${logins[2].sessionId}`)
      .set({ Authorization: `Bearer ${logins[0].token}` });
    expect(res.status).toBe(200);

    const list = await request(app)
      .get('/api/auth/sessions')
      .set({ Authorization: `Bearer ${logins[0].token}` });
    const ids = list.body.data.map((s: { sessionId: string }) => s.sessionId);
    expect(ids).not.toContain(logins[2].sessionId);
    expect(ids).toContain(logins[0].sessionId);
    expect(ids).toContain(logins[1].sessionId);
  });

  it('requires x-session-id for revoke-others', async () => {
    const res = await request(app)
      .delete('/api/auth/sessions/others')
      .set({ Authorization: `Bearer ${logins[0].token}` });
    expect(res.status).toBe(400);
  });

  it('revoke-others kills every session but the current one', async () => {
    const res = await request(app)
      .delete('/api/auth/sessions/others')
      .set({ Authorization: `Bearer ${logins[1].token}`, 'x-session-id': logins[1].sessionId });
    expect(res.status).toBe(200);
    expect(res.body.revoked).toBeGreaterThanOrEqual(1);

    const list = await request(app)
      .get('/api/auth/sessions')
      .set({ Authorization: `Bearer ${logins[1].token}` });
    const ids = list.body.data.map((s: { sessionId: string }) => s.sessionId);
    expect(ids).toEqual([logins[1].sessionId]);
  });
});
