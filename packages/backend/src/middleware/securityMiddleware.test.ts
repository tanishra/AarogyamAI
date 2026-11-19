import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { rateLimit } from './securityMiddleware';

function mockReq(ip = '1.2.3.4'): Request {
  return { ip, method: 'POST', path: '/login' } as unknown as Request;
}

describe('rateLimit middleware', () => {
  // Unique bucket per test → isolated Redis keys, no cross-test bleed
  it('allows requests under the limit', async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 3, bucket: 't-under' });
    const next = vi.fn() as NextFunction;
    for (let i = 0; i < 3; i++) await limiter(mockReq(`10.0.0.${i}`), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('returns 429 after exceeding the limit for same IP', async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 2, bucket: 't-over' });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;
    const req = mockReq('9.9.9.9');

    await limiter(req, res, next);
    await limiter(req, res, next);
    await limiter(req, res, next); // third exceeds maxRequests=2

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('tracks IPs independently', async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 1, bucket: 't-ips' });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    await limiter(mockReq('8.8.8.1'), res, next);
    await limiter(mockReq('8.8.8.2'), res, next); // different IP — allowed
    expect(next).toHaveBeenCalledTimes(2);
  });
});
