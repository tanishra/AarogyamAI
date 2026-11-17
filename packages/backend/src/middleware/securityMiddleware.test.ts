import { describe, it, expect, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import { rateLimit } from './securityMiddleware';

function mockReq(ip = '1.2.3.4'): Request {
  return { ip, method: 'POST', path: '/login' } as unknown as Request;
}

describe('rateLimit middleware', () => {
  it('allows requests under the limit', () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 3 });
    const next = vi.fn() as NextFunction;
    for (let i = 0; i < 3; i++) limiter(mockReq(`10.0.0.${i}`), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('returns 429 after exceeding the limit for same IP', () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 2 });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;
    const req = mockReq('9.9.9.9');

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next); // third exceeds maxRequests=2

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).toHaveBeenCalledTimes(2);
  });

  it('tracks IPs independently', () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 1 });
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as unknown as Response;
    const next = vi.fn() as NextFunction;

    limiter(mockReq('8.8.8.1'), res, next);
    limiter(mockReq('8.8.8.2'), res, next); // different IP — allowed
    expect(next).toHaveBeenCalledTimes(2);
  });
});
