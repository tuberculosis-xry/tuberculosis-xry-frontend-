import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCount = vi.fn();

vi.mock('@/app/lib/prisma', () => ({
  default: {
    ohifStudy: {
      count: (...args: unknown[]) => mockCount(...args),
    },
  },
}));

describe('GET /api/ohif/dicom-health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCount.mockResolvedValue(5);
  });

  it('returns 200 with ok true and studyCount when DB is healthy', async () => {
    const { GET } = await import('@/app/api/ohif/dicom-health/route');
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.studyCount).toBe(5);
    expect(data.message).toBe('App storage');
  });

  it('returns 500 with ok false when DB throws', async () => {
    mockCount.mockRejectedValueOnce(new Error('DB connection failed'));
    const { GET } = await import('@/app/api/ohif/dicom-health/route');
    const res = await GET();
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.ok).toBe(false);
    expect(data.message).toBeDefined();
  });
});
