import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindUnique = vi.fn();
const mockFindFirst = vi.fn();
const mockUpsert = vi.fn();
const mockOhifInstanceUpsert = vi.fn();
const mockOhifInstanceFindMany = vi.fn();

vi.mock('@/app/lib/prisma', () => ({
  default: {
    ohifStudy: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    ohifInstance: {
      upsert: (...args: unknown[]) => mockOhifInstanceUpsert(...args),
      findMany: (...args: unknown[]) => mockOhifInstanceFindMany(...args),
    },
  },
}));

vi.mock('dicom-parser', () => ({
  default: {
    parseDicom: (bytes: Uint8Array) => {
      if (bytes.length < 132) return {};
      return {
        string: (tag: string) => {
          if (tag === 'x0020000D') return '1.2.3.4.5.6.7';
          if (tag === 'x0020000E') return '1.2.3.4.5.6.8';
          if (tag === 'x00080018') return '1.2.3.4.5.6.9';
          if (tag === 'x00100010') return 'Test^Patient';
          if (tag === 'x00100020') return 'MRN001';
          if (tag === 'x00080020') return '20250101';
          if (tag === 'x00080030') return '120000';
          if (tag === 'x00081030') return 'Chest X-ray';
          if (tag === 'x00080060') return 'DX';
          if (tag === 'x00080050') return 'ACC001';
          if (tag === 'x00100040') return 'M';
          if (tag === 'x00100030') return '19900101';
          return '';
        },
        intString: (tag: string) => (tag === 'x00200013' ? '1' : '0'),
      };
    },
  },
}));

describe('POST /api/ohif/upload-dicom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindUnique.mockResolvedValue(null);
    mockFindFirst.mockResolvedValue(null);
    mockUpsert.mockResolvedValue({});
    mockOhifInstanceUpsert.mockResolvedValue({});
    mockOhifInstanceFindMany.mockResolvedValue([{ seriesInstanceUID: '1.2.3.4.5.6.8' }]);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true } as Response))
    );
  });

  it('returns 400 when no files provided', async () => {
    const { POST } = await import('@/app/api/ohif/upload-dicom/route');
    const formData = new FormData();
    const res = await POST(new Request('http://test/api/ohif/upload-dicom', {
      method: 'POST',
      body: formData,
    }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('No files');
  });

  it('returns 400 when too many files', async () => {
    const { POST } = await import('@/app/api/ohif/upload-dicom/route');
    const formData = new FormData();
    for (let i = 0; i < 101; i++) {
      formData.append('files', new Blob(['x'], { type: 'application/octet-stream' }), `f${i}.dcm`);
    }
    const res = await POST(new Request('http://test/api/ohif/upload-dicom', {
      method: 'POST',
      body: formData,
    }));
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toMatch(/maximum.*files/i);
  });

  it('uploads valid DICOM and upserts OhifStudy and OhifInstance (no PACS)', async () => {
    const { POST } = await import('@/app/api/ohif/upload-dicom/route');
    const formData = new FormData();
    const minimalDicom = new Uint8Array(200);
    minimalDicom.set([0x00, 0x00, 0x00, 0x00], 0);
    formData.append('files', new Blob([minimalDicom]), 'test.dcm');
    const res = await POST(new Request('http://test/api/ohif/upload-dicom', {
      method: 'POST',
      body: formData,
    }));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.uploaded).toBe(1);
    expect(mockUpsert).toHaveBeenCalled();
    expect(mockOhifInstanceUpsert).toHaveBeenCalled();
  });

  it('returns 500 when DB (ohifInstance.upsert) fails', async () => {
    mockOhifInstanceUpsert.mockRejectedValueOnce(new Error('DB connection failed'));
    const { POST } = await import('@/app/api/ohif/upload-dicom/route');
    const formData = new FormData();
    const minimalDicom = new Uint8Array(200);
    formData.append('files', new Blob([minimalDicom]), 'test.dcm');
    const res = await POST(new Request('http://test/api/ohif/upload-dicom', {
      method: 'POST',
      body: formData,
    }));
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toBeDefined();
  });
});
