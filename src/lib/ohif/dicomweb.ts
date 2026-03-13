/**
 * DICOMweb client — QIDO-RS (search studies/series) and WADO-RS (retrieve instances).
 * In the browser always uses same-origin /api/ohif/dicom-web so the viewer loads from app storage only.
 */

import type { PatientStudy, ViewerSeries } from './types';
import { parseInstanceMetadata, type InstanceMetadata } from './dicomMetadata';
import type { ViewerModeId } from './types';

// Always use app API in browser so viewer always hits our backend (no env, no other host).
const APP_DICOMWEB_PATH = '/api/ohif/dicom-web';
const BASE_URL = typeof window !== 'undefined' ? APP_DICOMWEB_PATH : '';

/** Optional: set a token getter (e.g. OIDC). When set, all QIDO/WADO/STOW requests include Authorization: Bearer <token>. */
let _dicomwebTokenGetter: (() => Promise<string | null>) | null = null;

export function setDicomwebTokenGetter(getter: (() => Promise<string | null>) | null): void {
  _dicomwebTokenGetter = getter;
}

async function getDicomwebHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extra };
  if (_dicomwebTokenGetter) {
    const token = await _dicomwebTokenGetter();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export interface QidoStudy {
  '0020000D': { Value: string[] };
  '00100010'?: { Value: string[] };
  '00100020'?: { Value: string[] };
  '00080020'?: { Value: string[] };
  '00081030'?: { Value: string[] };
  '00080061'?: { Value: string[] };
  '00080050'?: { Value: string[] };
  '00201209'?: { Value: string[] };
}

/** QIDO-RS series item (typical tag layout). */
export interface QidoSeriesItem {
  '0020000E'?: { Value: string[] };
  '00200011'?: { Value: string[] };
  '00080060'?: { Value: string[] };
  '0008103E'?: { Value: string[] };
  '00201209'?: { Value: string[] };
}

function getBase(): string {
  if (typeof window !== 'undefined') return APP_DICOMWEB_PATH.replace(/\/$/, '') || APP_DICOMWEB_PATH;
  return (BASE_URL || APP_DICOMWEB_PATH).replace(/\/$/, '');
}

/** DICOM JSON may use "0020000E" or "0020,000E"; prefer comma form (Part 18). */
function getTagValue(obj: Record<string, { Value?: string[] } | undefined>, tagNoComma: string): string | undefined {
  const withComma = tagNoComma.length === 8
    ? `${tagNoComma.slice(0, 4)},${tagNoComma.slice(4)}`
    : tagNoComma;
  return obj[tagNoComma]?.Value?.[0] ?? obj[withComma]?.Value?.[0];
}

export async function searchStudies(params: {
  PatientName?: string;
  PatientID?: string;
  StudyDate?: string;
  limit?: number;
}): Promise<QidoStudy[]> {
  const base = getBase();
  if (!base) return [];
  const search = new URLSearchParams();
  if (params.PatientName) search.set('PatientName', params.PatientName);
  if (params.PatientID) search.set('PatientID', params.PatientID);
  if (params.StudyDate) search.set('StudyDate', params.StudyDate);
  if (params.limit) search.set('limit', String(params.limit));
  const url = `${base}/studies?${search.toString()}`;
  const headers = await getDicomwebHeaders({ Accept: 'application/json' });
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`QIDO studies failed: ${res.status}`);
  return res.json();
}

export async function getSeries(studyInstanceUID: string): Promise<unknown[]> {
  const base = getBase();
  if (!base) return [];
  const url = `${base}/studies/${encodeURIComponent(studyInstanceUID)}/series`;
  const headers = await getDicomwebHeaders({ Accept: 'application/json' });
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`QIDO series failed: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data && typeof data === 'object' && Array.isArray((data as { series?: unknown[] }).series) ? (data as { series: unknown[] }).series : []);
}

/** QIDO-RS instance item (typical tag layout: SOP Instance UID, Instance Number). */
export interface QidoInstanceItem {
  '00080018'?: { Value: string[] }; // SOP Instance UID
  '00200013'?: { Value: string[] };  // Instance Number
}

/**
 * Fetch instances for a series (QIDO-RS). Returns ordered list of SOP Instance UIDs.
 * Sorted by Instance Number (0020,0013) when present.
 */
export async function fetchInstances(
  studyInstanceUID: string,
  seriesInstanceUID: string
): Promise<string[]> {
  const base = getBase();
  if (!base) return [];
  const url = `${base}/studies/${encodeURIComponent(studyInstanceUID)}/series/${encodeURIComponent(seriesInstanceUID)}/instances`;
  const headers = await getDicomwebHeaders({ Accept: 'application/json' });
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`QIDO instances failed: ${res.status}`);
  const rawData = await res.json();
  const raw = Array.isArray(rawData) ? rawData : [];
  const withNumber = raw.map((item: Record<string, { Value?: string[] } | undefined>) => {
    const sop = getTagValue(item, '00080018') ?? '';
    const num = getTagValue(item, '00200013');
    const instanceNumber = num != null ? parseInt(String(num), 10) : NaN;
    return { sop, instanceNumber: Number.isNaN(instanceNumber) ? 0 : instanceNumber };
  });
  withNumber.sort((a, b) => a.instanceNumber - b.instanceNumber);
  return withNumber.map((x) => x.sop).filter(Boolean);
}

/**
 * Build WADO-RS imageId for one instance (used by Cornerstone loader).
 * Format: wado:base|studyUid|seriesUid|sopUid so the loader can parse and call getInstanceFrame.
 */
export function buildWadoImageId(
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID: string
): string {
  const base = getBase();
  if (!base) return '';
  return `wado:${base}|${studyInstanceUID}|${seriesInstanceUID}|${sopInstanceUID}`;
}

/**
 * Parse a wado imageId back to components. Returns null if not a valid wado id.
 */
export function parseWadoImageId(imageId: string): { study: string; series: string; sop: string } | null {
  if (!imageId.startsWith('wado:')) return null;
  const rest = imageId.slice(5);
  const parts = rest.split('|');
  if (parts.length !== 4) return null;
  const [, study, series, sop] = parts;
  return study && series && sop ? { study, series, sop } : null;
}

/** Fetch raw DICOM bytes for one instance from app DB. Used by viewer to decode in browser. */
export async function getInstanceFrame(
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID: string
): Promise<ArrayBuffer> {
  const base = getBase();
  if (!base) throw new Error('DICOMweb base URL not configured');
  const url = `${base}/studies/${encodeURIComponent(studyInstanceUID)}/series/${encodeURIComponent(seriesInstanceUID)}/instances/${encodeURIComponent(sopInstanceUID)}/frames/1`;
  const headers = await getDicomwebHeaders({ Accept: 'application/dicom' });
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`WADO instance failed: ${res.status}`);
  const expectedBytes = res.headers.get('Content-Length');
  const buf = await res.arrayBuffer();
  if (expectedBytes != null && expectedBytes !== '') {
    const expected = parseInt(expectedBytes, 10);
    if (!Number.isNaN(expected) && buf.byteLength < expected) {
      throw new Error(
        `Response truncated (got ${buf.byteLength}, expected ${expected} bytes). Large files may hit server limits; try re-saving as smaller/uncompressed.`
      );
    }
  }
  if (buf.byteLength < 132) {
    throw new Error('Received DICOM is too small or empty; the file may not have been stored correctly.');
  }
  return buf;
}

/**
 * Fetch a backend-rendered preview image for one instance (same as TB Diagnosis tab).
 * Use this first; on any failure (503, 404, no image_base64), fall back to getInstanceFrame + dicomBufferToDataUrl.
 * Returns a data URL (e.g. data:image/png;base64,...). Throws on failure so caller can fall back.
 */
export async function getInstancePreview(
  studyInstanceUID: string,
  seriesInstanceUID: string,
  sopInstanceUID: string
): Promise<string> {
  const base = getBase();
  if (!base) throw new Error('DICOMweb base URL not configured');
  const url = `${base}/studies/${encodeURIComponent(studyInstanceUID)}/series/${encodeURIComponent(seriesInstanceUID)}/instances/${encodeURIComponent(sopInstanceUID)}/preview`;
  const headers = await getDicomwebHeaders({ Accept: 'application/json' });
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Preview failed: ${res.status}`);
  const data = (await res.json()) as { success?: boolean; image_base64?: string };
  const b64 = data?.image_base64;
  if (typeof b64 !== 'string' || !b64) throw new Error('Preview returned no image');
  const prefix = b64.startsWith('data:') ? '' : 'data:image/png;base64,';
  return prefix + b64;
}

export function isDicomWebConfigured(): boolean {
  return Boolean(getBase());
}

/** Cache instance metadata by imageId to avoid re-fetching DICOM for spacing. */
const instanceMetadataCache = new Map<string, InstanceMetadata>();

/**
 * Get metadata (pixel spacing, rows, columns) for an instance. Used for on-canvas measurements (length in mm, area in mm²).
 * Fetches WADO frame once and parses metadata; result is cached by imageId.
 */
export async function getInstanceMetadata(imageId: string): Promise<InstanceMetadata | null> {
  const cached = instanceMetadataCache.get(imageId);
  if (cached) return cached;
  const parsed = parseWadoImageId(imageId);
  if (!parsed) return null;
  try {
    const buffer = await getInstanceFrame(parsed.study, parsed.series, parsed.sop);
    const meta = parseInstanceMetadata(buffer);
    if (meta) instanceMetadataCache.set(imageId, meta);
    return meta;
  } catch {
    return null;
  }
}

/** Clear metadata cache (e.g. when switching studies). Optional. */
export function clearInstanceMetadataCache(): void {
  instanceMetadataCache.clear();
}

/** Derive default available modes from modality (no diagnosis data in QIDO). */
function defaultModesForModality(modality: string): ViewerModeId[] {
  const m = modality?.toUpperCase() ?? '';
  const modes: ViewerModeId[] = ['basic'];
  if (['CT', 'MR'].includes(m)) modes.push('segmentation');
  if (m === 'PT' || m === 'NM') modes.push('tmtv', 'preclinical-4d');
  if (m === 'SM') modes.push('microscopy');
  if (m === 'US') modes.push('us-pleura');
  return [...new Set(modes)];
}

/** Map QIDO-RS study to PatientStudy. */
export function mapQidoStudyToPatientStudy(q: QidoStudy): PatientStudy {
  const studyInstanceUID = q['0020000D']?.Value?.[0] ?? '';
  const modality = q['00080061']?.Value?.[0] ?? 'OT';
  return {
    studyInstanceUID,
    patientName: q['00100010']?.Value?.[0] ?? 'Unknown',
    patientId: q['00100020']?.Value?.[0] ?? '',
    mrn: q['00100020']?.Value?.[0] ?? '',
    studyDate: q['00080020']?.Value?.[0] ?? '',
    studyDescription: q['00081030']?.Value?.[0] ?? '',
    modality,
    accessionNumber: q['00080050']?.Value?.[0] ?? '',
    instances: parseInt(String(q['00201209']?.Value?.[0] ?? 0), 10) || 0,
    availableModes: defaultModesForModality(modality),
  };
}

/** Fetch studies from DICOMweb and return as PatientStudy[]. Returns [] if not configured or on error. */
export async function fetchStudiesFromDicomWeb(params: {
  PatientName?: string;
  PatientID?: string;
  StudyDate?: string;
  limit?: number;
}): Promise<{ studies: PatientStudy[]; error?: string }> {
  const base = getBase();
  if (!base) return { studies: [] };
  try {
    const raw = await searchStudies(params);
    const studies = raw.map(mapQidoStudyToPatientStudy).filter((s) => s.studyInstanceUID);
    return { studies };
  } catch (e) {
    return { studies: [], error: e instanceof Error ? e.message : 'Failed to load studies' };
  }
}

/** Map QIDO-RS series item to ViewerSeries. imageIds left undefined; viewer uses placeholder until DICOM loader is used. */
export function mapQidoSeriesToViewerSeries(q: QidoSeriesItem): ViewerSeries {
  const seriesInstanceUID = getTagValue(q as Record<string, { Value?: string[] } | undefined>, '0020000E') ?? '';
  const numInstances = parseInt(String(getTagValue(q as Record<string, { Value?: string[] } | undefined>, '00201209') ?? 0), 10) || 0;
  return {
    seriesInstanceUID,
    seriesNumber: getTagValue(q as Record<string, { Value?: string[] } | undefined>, '00200011') ?? undefined,
    modality: getTagValue(q as Record<string, { Value?: string[] } | undefined>, '00080060') ?? 'OT',
    seriesDescription: getTagValue(q as Record<string, { Value?: string[] } | undefined>, '0008103E') ?? '',
    numInstances,
  };
}

/** Fetch series for a study from DICOMweb. Returns [] if not configured or on error. */
export async function fetchSeriesFromDicomWeb(
  studyInstanceUID: string
): Promise<{ series: ViewerSeries[]; error?: string }> {
  const base = getBase();
  if (!base) return { series: [] };
  try {
    const raw = (await getSeries(studyInstanceUID)) as QidoSeriesItem[];
    const series = raw.map(mapQidoSeriesToViewerSeries);
    return { series };
  } catch (e) {
    return { series: [], error: e instanceof Error ? e.message : 'Failed to load series' };
  }
}

/**
 * Fetch series for a study and populate imageIds for each series (instance-level QIDO + WADO imageId build).
 * App DB only.
 */
export async function fetchSeriesWithInstances(
  studyInstanceUID: string
): Promise<{ series: ViewerSeries[]; error?: string }> {
  const base = getBase();
  if (!base) return { series: [] };
  try {
    const raw = (await getSeries(studyInstanceUID)) as QidoSeriesItem[];
    const seriesMeta = raw.map(mapQidoSeriesToViewerSeries);
    const series: ViewerSeries[] = [];
    for (const s of seriesMeta) {
      const instanceUids = await fetchInstances(studyInstanceUID, s.seriesInstanceUID);
      const imageIds = instanceUids.map((sop) =>
        buildWadoImageId(studyInstanceUID, s.seriesInstanceUID, sop)
      ).filter(Boolean);
      series.push({
        ...s,
        imageIds: imageIds.length > 0 ? imageIds : undefined,
      });
    }
    return { series };
  } catch (e) {
    return { series: [], error: e instanceof Error ? e.message : 'Failed to load series with instances' };
  }
}

/**
 * Fetch series for multiple studies and merge into one list (for one patient, all studies).
 * Used when opening the viewer with StudyInstanceUIDs=uid1,uid2,...
 */
export async function fetchSeriesWithInstancesForStudies(
  studyInstanceUIDs: string[]
): Promise<{ series: ViewerSeries[]; error?: string }> {
  const uids = studyInstanceUIDs.filter((u) => u.trim().length > 0);
  if (uids.length === 0) return { series: [] };
  const allSeries: ViewerSeries[] = [];
  let lastError: string | undefined;
  const seenSeries = new Set<string>();
  for (const uid of uids) {
    const { series, error } = await fetchSeriesWithInstances(uid);
    if (error) lastError = error;
    for (const s of series) {
      if (s.seriesInstanceUID && !seenSeries.has(s.seriesInstanceUID)) {
        seenSeries.add(s.seriesInstanceUID);
        allSeries.push(s);
      }
    }
  }
  return { series: allSeries, error: allSeries.length === 0 ? lastError : undefined };
}
