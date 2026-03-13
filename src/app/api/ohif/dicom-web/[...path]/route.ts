/**
 * DICOMweb (QIDO-RS / WADO-RS) backed by app DB only.
 * GET studies?PatientID=xxx — studies for that patient.
 * GET studies/{uid}/series — series for that study.
 * GET studies/{uid}/series/{uid}/instances — instances for that series.
 * GET studies/{uid}/series/{uid}/instances/{sop}/frames/1 — raw DICOM bytes.
 */

import { NextRequest, NextResponse } from 'next/server';

/** Allow longer for large DICOM retrieval (e.g. multi-MB frames). */
export const maxDuration = 60;
import prisma from '@/app/lib/prisma';

/** Prisma client including OhifInstance (run `npx prisma generate`). Cast when TS types are stale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { ohifInstance: any };

/** Log preview-backend unavailability only once per process to avoid terminal spam. */
let previewBackendUnavailableLogged = false;

/** QIDO-RS study object: tag number (with comma) -> { Value: string[] }. */
function studyToQido(study: {
  studyInstanceUID: string;
  patientName: string;
  patientId: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  accessionNumber: string;
  instances: number;
}) {
  return {
    '0020000D': { Value: [study.studyInstanceUID] },
    '00100010': { Value: [study.patientName] },
    '00100020': { Value: [study.patientId] },
    '00080020': { Value: [study.studyDate] },
    '00081030': { Value: [study.studyDescription] },
    '00080061': { Value: [study.modality] },
    '00080050': { Value: [study.accessionNumber] },
    '00201209': { Value: [String(study.instances)] },
  };
}

/** QIDO-RS series object from instance metadata. */
function seriesToQido(seriesInstanceUID: string, modality: string, seriesDescription: string, seriesNumber: string, numInstances: number) {
  return {
    '0020000E': { Value: [seriesInstanceUID] },
    '00200011': { Value: [seriesNumber] },
    '00080060': { Value: [modality] },
    '0008103E': { Value: [seriesDescription] },
    '00201209': { Value: [String(numInstances)] },
  };
}

/** QIDO-RS instance object. */
function instanceToQido(sopInstanceUID: string, instanceNumber: number) {
  return {
    '00080018': { Value: [sopInstanceUID] },
    '00200013': { Value: [String(instanceNumber)] },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params;
    const parts = Array.isArray(pathSegments)
      ? pathSegments
      : typeof pathSegments === 'string'
        ? (pathSegments as string).split('/').filter(Boolean)
        : [];
    const path = parts.join('/');
    if (!path) {
      return NextResponse.json({ error: 'Missing path' }, { status: 400 });
    }
    const search = request.nextUrl.searchParams;

    const trimUid = (u: string) => decodeURIComponent(u).trim();

    // GET studies?PatientID=xxx
    if (parts[0] === 'studies' && parts.length === 1) {
      const patientId = search.get('PatientID')?.trim();
      if (!patientId) {
        return NextResponse.json([], { headers: { 'Content-Type': 'application/json' } });
      }
      const studies = await prisma.ohifStudy.findMany({
        where: { OR: [{ mrn: patientId }, { patientId }] },
        select: {
          studyInstanceUID: true,
          patientName: true,
          patientId: true,
          studyDate: true,
          studyDescription: true,
          modality: true,
          accessionNumber: true,
          instances: true,
        },
      });
      const limit = Math.min(500, parseInt(search.get('limit') ?? '500', 10) || 500);
      const qido = studies.slice(0, limit).map(studyToQido);
      return NextResponse.json(qido, { headers: { 'Content-Type': 'application/json' } });
    }

    // GET studies/{StudyInstanceUID}/series
    if (parts[0] === 'studies' && parts.length === 3 && parts[2] === 'series') {
      const studyInstanceUID = trimUid(parts[1] ?? '');
      if (!studyInstanceUID) {
        return NextResponse.json({ error: 'Missing StudyInstanceUID' }, { status: 400 });
      }
      const [study, instances] = await Promise.all([
        prisma.ohifStudy.findUnique({
          where: { studyInstanceUID },
          select: { modality: true },
        }),
        db.ohifInstance.findMany({
          where: { studyInstanceUID },
          select: { seriesInstanceUID: true, instanceNumber: true },
          orderBy: { instanceNumber: 'asc' },
        }),
      ]);
      const modality = study?.modality?.trim() || 'OT';
      const bySeries = new Map<string, { count: number }>();
      for (const i of instances) {
        const cur = bySeries.get(i.seriesInstanceUID);
        if (cur) cur.count += 1;
        else bySeries.set(i.seriesInstanceUID, { count: 1 });
      }
      const seriesList = Array.from(bySeries.entries()).map(([seriesInstanceUID, { count }]) =>
        seriesToQido(seriesInstanceUID, modality, '', '1', count)
      );
      return NextResponse.json(seriesList, { headers: { 'Content-Type': 'application/json' } });
    }

    // GET studies/{StudyInstanceUID}/series/{SeriesUID}/instances
    if (parts[0] === 'studies' && parts.length === 5 && parts[2] === 'series' && parts[4] === 'instances') {
      const studyInstanceUID = trimUid(parts[1] ?? '');
      const seriesInstanceUID = trimUid(parts[3] ?? '');
      if (!studyInstanceUID || !seriesInstanceUID) {
        return NextResponse.json({ error: 'Missing UIDs' }, { status: 400 });
      }
      const instances = await db.ohifInstance.findMany({
        where: { studyInstanceUID, seriesInstanceUID },
        select: { sopInstanceUID: true, instanceNumber: true },
        orderBy: { instanceNumber: 'asc' },
      });
      const qido = instances.map((i: { sopInstanceUID: string; instanceNumber: number }) => instanceToQido(i.sopInstanceUID, i.instanceNumber));
      return NextResponse.json(qido, { headers: { 'Content-Type': 'application/json' } });
    }

    // GET studies/{StudyInstanceUID}/series/{SeriesUID}/instances/{SOPInstanceUID}/frames/1 — raw DICOM
    if (
      parts[0] === 'studies' &&
      parts.length === 8 &&
      parts[2] === 'series' &&
      parts[4] === 'instances' &&
      parts[6] === 'frames' &&
      parts[7] === '1'
    ) {
      const studyInstanceUID = trimUid(parts[1] ?? '');
      const seriesInstanceUID = trimUid(parts[3] ?? '');
      const sopInstanceUID = trimUid(parts[5] ?? '');
      if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
        return NextResponse.json({ error: 'Missing UIDs' }, { status: 400 });
      }
      const instance = await db.ohifInstance.findFirst({
        where: {
          sopInstanceUID,
          studyInstanceUID,
          seriesInstanceUID,
        },
        select: { dicomBytes: true },
      });
      if (!instance) {
        return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
      }
      const buf = Buffer.from(instance.dicomBytes);
      return new NextResponse(buf, {
        headers: {
          'Content-Type': 'application/dicom',
          'Content-Length': String(buf.length),
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // GET studies/{StudyInstanceUID}/series/{SeriesUID}/instances/{SOPInstanceUID}/preview — backend-rendered image (same as TB Diagnosis)
    if (
      parts[0] === 'studies' &&
      parts.length === 7 &&
      parts[2] === 'series' &&
      parts[4] === 'instances' &&
      parts[6] === 'preview'
    ) {
      const modelBackend = (process.env.MODEL_BACKEND || process.env.NEXT_PUBLIC_API_URL || '').trim();
      if (!modelBackend) {
        if (!previewBackendUnavailableLogged) {
          previewBackendUnavailableLogged = true;
          console.warn('[dicom-web] MODEL_BACKEND / NEXT_PUBLIC_API_URL not set; preview will be unavailable. Viewer will use frame fallback.');
        }
        return NextResponse.json(
          { success: false, previewUnavailable: true },
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const studyInstanceUID = trimUid(parts[1] ?? '');
      const seriesInstanceUID = trimUid(parts[3] ?? '');
      const sopInstanceUID = trimUid(parts[5] ?? '');
      if (!studyInstanceUID || !seriesInstanceUID || !sopInstanceUID) {
        return NextResponse.json({ error: 'Missing UIDs' }, { status: 400 });
      }
      const instance = await db.ohifInstance.findFirst({
        where: {
          sopInstanceUID,
          studyInstanceUID,
          seriesInstanceUID,
        },
        select: { dicomBytes: true },
      });
      if (!instance) {
        return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
      }
      const dicomBuffer = Buffer.from(instance.dicomBytes);
      const formData = new FormData();
      formData.append('image', new Blob([dicomBuffer], { type: 'application/dicom' }), 'instance.dcm');
      // Use .then/.catch so fetch rejection is never thrown to Next.js (avoids dev server stack trace spam)
      const response = await fetch(`${modelBackend}/preview`, {
        method: 'POST',
        body: formData,
      }).catch(() => null);
      if (response === null) {
        if (!previewBackendUnavailableLogged) {
          previewBackendUnavailableLogged = true;
          console.warn('[dicom-web] Preview backend unreachable (e.g. not running). Viewer will use frame fallback. Set MODEL_BACKEND or start the backend to enable preview.');
        }
        return NextResponse.json(
          { success: false, previewUnavailable: true },
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (!response.ok) {
        if (!previewBackendUnavailableLogged) {
          previewBackendUnavailableLogged = true;
          console.warn('[dicom-web] Preview backend returned', response.status, '; viewer will use frame fallback.');
        }
        const errBody = await response.json().catch(() => ({}));
        return NextResponse.json(
          { success: false, previewUnavailable: true, message: (errBody as { detail?: string }).detail || 'Preview failed' },
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const json = (await response.json()) as { success?: boolean; image_base64?: string };
      return NextResponse.json({
        success: json.success === true,
        image_base64: json.image_base64 ?? undefined,
      }, { headers: { 'Content-Type': 'application/json' } });
    }

    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (e) {
    console.warn('[dicom-web] Request failed:', e instanceof Error ? e.message : 'Unknown error');
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Request failed' },
      { status: 500 }
    );
  }
}
