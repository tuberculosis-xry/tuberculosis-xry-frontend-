/**
 * POST /api/ohif/upload-dicom — store DICOM files in app DB (OhifInstance) and create/update OhifStudy.
 * Multipart form field: "files" (multiple) or "file" (single).
 */

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import dicomParser from 'dicom-parser';
import prisma from '@/app/lib/prisma';
import { transcodeIfNeeded } from '@/lib/ohif/transcodeDicomToSupported';

/** Prisma client including OhifInstance (schema has OhifInstance; run `npx prisma generate`). Delegate typed loosely when TS cache is stale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OhifInstance delegate; generated client has it after prisma generate
const db = prisma as typeof prisma & { ohifInstance: any };

// #region agent log
function _debugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId?: string
) {
  const payload = {
    sessionId: '9b4aa1',
    location,
    message,
    data,
    timestamp: Date.now(),
    ...(hypothesisId && { hypothesisId }),
  };
  fetch('http://127.0.0.1:7272/ingest/3c1f9efd-1ca8-43c7-a9ed-d37e50eba40a', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9b4aa1' },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
// #endregion

const MAX_FILE_SIZE_MB = Number(process.env.OHIF_UPLOAD_MAX_FILE_MB) || 100;
const MAX_FILES = Math.min(500, Math.max(1, Number(process.env.OHIF_UPLOAD_MAX_FILES) || 100));

/** Normalize DICOM study date YYYYMMDD to YYYY-MM-DD for storage and filtering. */
function normalizeStudyDate(raw: string): string {
  const s = (raw ?? '').trim();
  if (s.length >= 8) {
    const y = s.slice(0, 4), m = s.slice(4, 6), d = s.slice(6, 8);
    if (/\d{4}/.test(y) && /\d{2}/.test(m) && /\d{2}/.test(d)) return `${y}-${m}-${d}`;
  }
  return new Date().toISOString().slice(0, 10);
}

/** Normalize DICOM study time HHMMSS[.frac] to HH:MM for display (PatientTable formatStudyTime). */
function normalizeStudyTime(raw: string): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  const numPart = s.split('.')[0];
  if (numPart.length >= 4) {
    const hh = numPart.slice(0, 2), mm = numPart.slice(2, 4);
    if (/\d{2}/.test(hh) && /\d{2}/.test(mm)) return `${hh}:${mm}`;
  }
  return s;
}

/** Current time as HH:MM for generated study time. */
function currentTimeHHMM(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Implicit VR Little Endian – used for raw DICOM without Part 10 preamble */
const TRANSFER_SYNTAX_IMPLICIT_LE = '1.2.840.10008.1.2';

/** Generate a DICOM-like UID from current date/time and uniqueness (for missing tags). */
function generateDicomUid(): string {
  const t = Date.now();
  const r = Math.random().toString(16).slice(2, 10);
  return `1.2.840.${t}.${r}`;
}

export type ParsedDicomMetadata = {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  instanceNumber: number;
  patientName: string;
  patientId: string;
  studyDate: string;
  studyTime: string;
  studyDescription: string;
  modality: string;
  accessionNumber: string;
  patientSex?: string;
  patientBirthDate?: string;
  /** True when Study (and possibly Series/SOP) UIDs were generated because missing in file. */
  studyInstanceUIDGenerated?: boolean;
};

function parseDicomMetadata(buffer: ArrayBuffer): ParsedDicomMetadata | null {
  const byteArray = new Uint8Array(buffer);
  const generateUid = () => generateDicomUid();
  const getMetadata = (dataSet: { string: (tag: string) => string | undefined; intString: (tag: string) => string | undefined }) => {
    const getStr = (tag: string): string =>
      (dataSet.string(tag) ?? '').trim();
    const getInt = (tag: string): number =>
      parseInt(dataSet.intString(tag) ?? '0', 10) || 0;
    let studyInstanceUID = getStr('x0020000D');
    let seriesInstanceUID = getStr('x0020000E');
    let sopInstanceUID = getStr('x00080018');
    let studyInstanceUIDGenerated = false;
    if (!studyInstanceUID) {
      studyInstanceUID = generateUid();
      studyInstanceUIDGenerated = true;
    }
    if (!seriesInstanceUID) seriesInstanceUID = generateUid();
    if (!sopInstanceUID) sopInstanceUID = generateUid();
    return {
      studyInstanceUID,
      seriesInstanceUID,
      sopInstanceUID,
      instanceNumber: getInt('x00200013'),
      patientName: getStr('x00100010').replace(/\^/g, ' ').trim() || '',
      patientId: getStr('x00100020').trim() || '',
      studyDate: getStr('x00080020'),
      studyTime: getStr('x00080030'),
      studyDescription: getStr('x00081030').trim() || '',
      modality: getStr('x00080060').trim() || 'OT',
      accessionNumber: getStr('x00080050').trim() || '',
      patientSex: getStr('x00100040').trim() || undefined,
      patientBirthDate: getStr('x00100030').trim() || undefined,
      ...(studyInstanceUIDGenerated && { studyInstanceUIDGenerated: true }),
    };
  };
  let lastError: unknown;
  try {
    const dataSet = dicomParser.parseDicom(byteArray);
    return getMetadata(dataSet as unknown as Parameters<typeof getMetadata>[0]);
  } catch (e) {
    lastError = e;
  }
  try {
    const dataSet = dicomParser.parseDicom(byteArray, { TransferSyntaxUID: TRANSFER_SYNTAX_IMPLICIT_LE });
    return getMetadata(dataSet as unknown as Parameters<typeof getMetadata>[0]);
  } catch (e2) {
    lastError = e2;
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  console.error('[upload-dicom] DICOM parse error:', msg);
  // #region agent log
  _debugLog(
    'upload-dicom/route.ts:parseDicomMetadata',
    'Parse failed (both Part10 and raw)',
    { reason: msg, bufferLen: buffer.byteLength },
    'H3'
  );
  // #endregion
  return null;
}

/** Generate a unique Patient ID / MRN not already in OhifStudy. */
async function generateUniquePatientId(): Promise<string> {
  const maxTries = 10;
  for (let i = 0; i < maxTries; i++) {
    const candidate = randomUUID();
    const existing = await prisma.ohifStudy.findFirst({
      where: { OR: [{ patientId: candidate }, { mrn: candidate }] },
    });
    if (!existing) return candidate;
  }
  return `${randomUUID()}-${Date.now()}`;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files: File[] = [];
    const filesField = formData.getAll('files');
    if (filesField.length > 0) {
      files.push(...(filesField as File[]));
    } else {
      const single = formData.get('file');
      if (single instanceof File) files.push(single);
    }
    // #region agent log
    _debugLog(
      'upload-dicom/route.ts:POST:entry',
      'FormData received',
      {
        filesFieldLength: filesField.length,
        hasFileSingle: !!formData.get('file'),
        filesLength: files.length,
        fileNames: files.slice(0, 10).map((f) => ({ name: f.name, size: f.size })),
      },
      'H1'
    );
    // #endregion
    if (files.length === 0) {
      const msg = 'No files provided; use form field "files" or "file".';
      // #region agent log
      _debugLog('upload-dicom/route.ts:400', 'Returning 400', { reason: 'no_files', msg }, 'H1');
      // #endregion
      console.error('[upload-dicom] 400:', msg);
      return NextResponse.json(
        { success: false, error: msg },
        { status: 400 }
      );
    }
    if (files.length > MAX_FILES) {
      const msg = `Too many files. Maximum ${MAX_FILES} files per upload.`;
      // #region agent log
      _debugLog('upload-dicom/route.ts:400', 'Returning 400', { reason: 'too_many', filesLength: files.length, MAX_FILES, msg }, 'H1');
      // #endregion
      console.error('[upload-dicom] 400:', msg);
      return NextResponse.json(
        { success: false, error: msg },
        { status: 400 }
      );
    }

    const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
    const rejected: string[] = [];
    const dicomFiles: File[] = [];
    for (const file of files) {
      const name = file.name?.toLowerCase() ?? '';
      if (!name.endsWith('.dcm') && !name.endsWith('.dicom')) {
        rejected.push(`${file.name}: not a .dcm/.dicom file`);
        continue;
      }
      if (file.size > maxBytes) {
        rejected.push(`${file.name}: exceeds ${MAX_FILE_SIZE_MB} MB`);
        continue;
      }
      dicomFiles.push(file);
    }
    // #region agent log
    _debugLog('upload-dicom/route.ts:POST:afterFilter', 'After extension/size filter', { rejectedCount: rejected.length, rejectedSample: rejected.slice(0, 5), dicomFilesCount: dicomFiles.length }, 'H2');
    // #endregion
    if (dicomFiles.length === 0) {
      const msg = rejected.length ? rejected.join('; ') : 'No valid DICOM files.';
      // #region agent log
      _debugLog('upload-dicom/route.ts:400', 'Returning 400', { reason: 'no_valid', rejectedCount: rejected.length, rejectedSample: rejected.slice(0, 5), msg }, 'H2');
      // #endregion
      console.error('[upload-dicom] 400:', msg);
      return NextResponse.json(
        { success: false, error: msg },
        { status: 400 }
      );
    }

    // Optional overrides from dialog (when DICOM fields are missing)
    const getOverride = (key: string): string => {
      const v = formData.get(key);
      return v != null && typeof v === 'string' ? v.trim() : '';
    };
    const overridePatientName = getOverride('override_patientName');
    const overridePatientId = getOverride('override_patientId');
    const overrideUseGeneratedPatientId = (formData.get('override_useGeneratedPatientId') === 'true' || formData.get('override_useGeneratedPatientId') === '1');
    const overrideStudyDescription = getOverride('override_studyDescription');
    const overrideAccessionNumber = getOverride('override_accessionNumber');
    const overridePatientSex = getOverride('override_patientSex');
    const overridePatientBirthDate = getOverride('override_patientBirthDate');

    // Parse all files first; fail entire request if any cannot be read as DICOM
    const parsed: { file: File; buffer: ArrayBuffer; metadata: ParsedDicomMetadata }[] = [];
    const parseFailed: string[] = [];
    for (const file of dicomFiles) {
      const buffer = await file.arrayBuffer();
      const metadata = parseDicomMetadata(buffer);
      if (!metadata || !metadata.studyInstanceUID) {
        parseFailed.push(file.name);
        continue;
      }
      parsed.push({ file, buffer, metadata });
    }
    if (parseFailed.length > 0) {
      const msg = `The following files could not be read as DICOM: ${parseFailed.join(', ')}.`;
      // #region agent log
      _debugLog('upload-dicom/route.ts:400', 'Returning 400', { reason: 'parse_failed', parseFailedCount: parseFailed.length, parseFailedNames: parseFailed, parsedCount: parsed.length, msg }, 'H3');
      // #endregion
      console.error('[upload-dicom] 400:', msg);
      return NextResponse.json(
        { success: false, error: msg },
        { status: 400 }
      );
    }

    const studyMap = new Map<
      string,
      {
        metadata: ParsedDicomMetadata;
        instanceCount: number;
        seriesSet: Set<string>;
      }
    >();
    const nonDxWarnings: string[] = [];

    for (const { file, buffer, metadata } of parsed) {
      const mod = (metadata.modality ?? '').toUpperCase().trim();
      if (mod !== 'DX' && mod !== '') {
        nonDxWarnings.push(`${file.name}: ${metadata.modality}`);
      }

      let bytesToStore: ArrayBuffer = buffer;
      try {
        const transcoded = await transcodeIfNeeded(buffer);
        if (transcoded) bytesToStore = transcoded;
      } catch (e) {
        console.warn('[upload-dicom] Transcode failed, storing original:', e);
      }

      const patientId = metadata.patientId?.trim() || metadata.patientName?.trim() || '—';
      await db.ohifInstance.upsert({
        where: { sopInstanceUID: metadata.sopInstanceUID },
        create: {
          studyInstanceUID: metadata.studyInstanceUID,
          seriesInstanceUID: metadata.seriesInstanceUID,
          sopInstanceUID: metadata.sopInstanceUID,
          patientId,
          mrn: patientId,
          instanceNumber: metadata.instanceNumber ?? 0,
          dicomBytes: Buffer.from(bytesToStore),
        },
        update: {
          studyInstanceUID: metadata.studyInstanceUID,
          seriesInstanceUID: metadata.seriesInstanceUID,
          patientId,
          mrn: patientId,
          instanceNumber: metadata.instanceNumber ?? 0,
          dicomBytes: Buffer.from(bytesToStore),
        },
      });

      const resolvedStudyInstanceUID = metadata.studyInstanceUID;
      const existing = studyMap.get(resolvedStudyInstanceUID);
      if (existing) {
        existing.instanceCount += 1;
        existing.seriesSet.add(metadata.seriesInstanceUID);
      } else {
        const seriesSet = new Set<string>([metadata.seriesInstanceUID]);
        studyMap.set(resolvedStudyInstanceUID, {
          metadata: { ...metadata, studyInstanceUID: resolvedStudyInstanceUID },
          instanceCount: 1,
          seriesSet,
        });
      }
    }

    const generatedPatientId = overrideUseGeneratedPatientId ? await generateUniquePatientId() : null;

    // Single batch = single patient: use one canonical patient name and MRN for ALL studies in this request
    let batchPatientName = overridePatientName.trim();
    let batchPatientId =
      overrideUseGeneratedPatientId && generatedPatientId ? generatedPatientId : overridePatientId.trim();
    if (!batchPatientName || !batchPatientId) {
      for (const { metadata } of studyMap.values()) {
        if (!batchPatientName && metadata.patientName?.trim()) batchPatientName = metadata.patientName.trim();
        if (!batchPatientId && metadata.patientId?.trim()) batchPatientId = metadata.patientId.trim();
        if (batchPatientName && batchPatientId) break;
      }
    }

    for (const [studyInstanceUID, { metadata: m, instanceCount }] of studyMap) {
      // Apply same patient to every study in this batch so they group as one row
      const patientName = batchPatientName;
      const patientId = batchPatientId;
      const mrn = patientId || '—';
      const studyDescription = (m.studyDescription?.trim() || overrideStudyDescription) || '';
      const accessionNumber = (m.accessionNumber?.trim() || overrideAccessionNumber).trim() || '—';
      const patientSex = (m.patientSex?.trim() || overridePatientSex) || undefined;
      const patientBirthDate = (m.patientBirthDate?.trim() || overridePatientBirthDate) || undefined;

      const rawDate = (m.studyDate ?? '').trim();
      const rawTime = (m.studyTime ?? '').trim();
      let studyDate: string;
      let studyTime: string | null;
      if (!rawDate && !rawTime) {
        studyDate = new Date().toISOString().slice(0, 10);
        studyTime = currentTimeHHMM();
      } else {
        studyDate = normalizeStudyDate(rawDate || new Date().toISOString().slice(0, 10).replace(/-/g, ''));
        studyTime = normalizeStudyTime(m.studyTime ?? '');
      }

      const missing: string[] = [];
      if (!patientName) missing.push('Patient Name');
      if (!patientId) missing.push('Patient ID');
      if (!patientSex) missing.push('Patient Sex');
      if (!patientBirthDate) missing.push('Patient Birth Date');
      if (missing.length > 0) {
        return NextResponse.json(
          { success: false, error: `Missing required: ${missing.join(', ')}. Please complete the form and try again.` },
          { status: 400 }
        );
      }

      const existingStudy = await prisma.ohifStudy.findUnique({
        where: { studyInstanceUID },
      });
      const newInstances = (existingStudy?.instances ?? 0) + instanceCount;
      const instancesForStudy = await db.ohifInstance.findMany({
        where: { studyInstanceUID },
        select: { seriesInstanceUID: true },
      });
      const seriesCount = new Set(instancesForStudy.map((i: { seriesInstanceUID: string }) => i.seriesInstanceUID)).size;

      await prisma.ohifStudy.upsert({
        where: { studyInstanceUID },
        create: {
          studyInstanceUID,
          patientName,
          patientId,
          mrn,
          studyDate,
          studyTime,
          studyDescription: studyDescription || '',
          modality: m.modality || 'OT',
          accessionNumber,
          instances: instanceCount,
          seriesCount,
          availableModes: ['basic'],
          patientSex: patientSex || null,
          patientBirthDate: patientBirthDate || null,
        },
        update: {
          instances: newInstances,
          patientName,
          patientId,
          mrn,
          studyDescription: studyDescription || '',
          modality: m.modality || 'OT',
          accessionNumber,
          seriesCount,
          patientSex: patientSex || null,
          patientBirthDate: patientBirthDate || null,
        },
      });
    }

    // #region agent log
    _debugLog('upload-dicom/route.ts:POST:success', 'Returning 200', { uploaded: parsed.length, studiesCount: studyMap.size, skipped: rejected.length }, 'success');
    // #endregion
    return NextResponse.json({
      success: true,
      uploaded: parsed.length,
      skipped: rejected.length,
      studies: Array.from(studyMap.keys()),
      ...(nonDxWarnings.length > 0 && { warnings: nonDxWarnings }),
    });
  } catch (e) {
    console.error('[POST /api/ohif/upload-dicom]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
