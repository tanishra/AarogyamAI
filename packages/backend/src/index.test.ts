import { describe, it, expect } from 'vitest';

describe('Backend Setup', () => {
  it('should have NODE_ENV defined', () => {
    expect(process.env.NODE_ENV).toBeDefined();
  });

  it('should export a valid port number', () => {
    const port = process.env.PORT || 3001;
    expect(Number(port)).toBeGreaterThan(0);
    expect(Number(port)).toBeLessThan(65536);
  });
});
