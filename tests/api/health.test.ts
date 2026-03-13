import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/app/lib/prisma', () => ({
  default: {
    tuberculosisDiagnosis: {
      findFirst: vi.fn().mockResolvedValue({ id: 'test-id' }),
    },
  },
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true } as Response))
    );
  });

  it('returns 200 with frontend true when backend and DB are ok', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.frontend).toBe(true);
    expect(data.status).toBe('healthy');
  });

  it('returns payload with timestamp and backend/database flags', async () => {
    const { GET } = await import('@/app/api/health/route');
    const res = await GET();
    const data = await res.json();
    expect(data).toHaveProperty('timestamp');
    expect(typeof data.frontend).toBe('boolean');
    expect(['healthy', 'degraded', 'unhealthy']).toContain(data.status);
  });
});
