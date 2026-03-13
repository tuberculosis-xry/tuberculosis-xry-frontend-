import { describe, it, expect } from 'vitest';
import { getRateLimitId, checkRateLimit } from '@/app/lib/rateLimit';

describe('getRateLimitId', () => {
  it('returns user:uid when userId is provided', () => {
    const req = new Request('http://localhost/api/scans', {
      headers: {},
    });
    expect(getRateLimitId(req, 'user-123')).toBe('user:user-123');
  });

  it('returns ip:... when userId is absent', () => {
    const req = new Request('http://localhost/api/scans', {
      headers: { 'x-forwarded-for': '192.168.1.1' },
    });
    expect(getRateLimitId(req, null)).toBe('ip:192.168.1.1');
  });
});

describe('checkRateLimit', () => {
  it('allows first request', () => {
    expect(checkRateLimit('user:test', 'read')).toEqual({ allowed: true });
  });
});
