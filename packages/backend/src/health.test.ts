import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('./config/database', () => ({
  getDatabasePool: vi.fn(() => ({ query: vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] }) })),
  checkDatabaseHealth: vi.fn().mockResolvedValue(true),
}));
vi.mock('./config/redis', () => ({
  checkRedisHealth: vi.fn().mockResolvedValue(true),
  getRedisClient: vi.fn(),
}));

import app from './index';

describe('Health endpoints', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /readyz returns ready when DB+Redis healthy', async () => {
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.checks.database).toBe('ok');
    expect(res.body.checks.redis).toBe('ok');
  });
});
