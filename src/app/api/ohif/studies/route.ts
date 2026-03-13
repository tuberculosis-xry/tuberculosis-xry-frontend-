import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';

/** Prisma client including OhifInstance. Cast when TS types are stale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { ohifInstance: any };

const VALID_MODES = ['basic', 'segmentation', 'preclinical-4d', 'microscopy', 'us-pleura', 'tmtv'] as const;

/** GET /api/ohif/studies — list OHIF studies that have at least one DICOM instance (so viewer can load images). Optional filters. */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientName = searchParams.get('patientName')?.trim();
    const mrn = searchParams.get('mrn')?.trim();
    const patientSex = searchParams.get('patientSex')?.trim();
    const studyDateFrom = searchParams.get('studyDateFrom')?.trim();
    const studyDateTo = searchParams.get('studyDateTo')?.trim();
    const description = searchParams.get('description')?.trim();
    const modality = searchParams.get('modality')?.trim();
    const accessionNumber = searchParams.get('accessionNumber')?.trim();
    const instancesMin = searchParams.get('instancesMin')?.trim();

    const list = await prisma.ohifStudy.findMany({
      orderBy: { studyDate: 'desc' },
    });

    const instanceRows = await db.ohifInstance.findMany({
      select: { studyInstanceUID: true },
    });
    const studyUidsWithInstances = new Set(instanceRows.map((r: { studyInstanceUID: string }) => r.studyInstanceUID));
    const listWithImages = list.filter((s) => studyUidsWithInstances.has(s.studyInstanceUID));

    let filtered = listWithImages;
    if (patientName) {
      const q = patientName.toLowerCase();
      filtered = filtered.filter((s) => s.patientName.toLowerCase().includes(q));
    }
    if (mrn) {
      const q = mrn.toLowerCase();
      filtered = filtered.filter((s) => s.mrn.toLowerCase().includes(q));
    }
    if (patientSex) {
      filtered = filtered.filter((s) => (s.patientSex ?? '') === patientSex);
    }
    if (studyDateFrom) {
      filtered = filtered.filter((s) => s.studyDate >= studyDateFrom);
    }
    if (studyDateTo) {
      filtered = filtered.filter((s) => s.studyDate <= studyDateTo);
    }
    if (description) {
      const q = description.toLowerCase();
      filtered = filtered.filter((s) => s.studyDescription.toLowerCase().includes(q));
    }
    if (modality) {
      const q = modality.toLowerCase();
      filtered = filtered.filter((s) => s.modality.toLowerCase().includes(q));
    }
    if (accessionNumber) {
      const q = accessionNumber.toLowerCase();
      filtered = filtered.filter((s) => s.accessionNumber.toLowerCase().includes(q));
    }
    if (instancesMin) {
      const min = parseInt(instancesMin, 10);
      if (!Number.isNaN(min)) filtered = filtered.filter((s) => s.instances >= min);
    }

    const studies = filtered.map((s) => ({
      id: s.id,
      studyInstanceUID: s.studyInstanceUID,
      patientName: s.patientName,
      patientId: s.patientId,
      mrn: s.mrn,
      studyDate: s.studyDate,
      studyTime: s.studyTime ?? undefined,
      studyDescription: s.studyDescription,
      modality: s.modality,
      accessionNumber: s.accessionNumber,
      instances: s.instances,
      seriesCount: s.seriesCount ?? undefined,
      availableModes: s.availableModes as typeof VALID_MODES[number][],
      patientSex: s.patientSex ?? undefined,
      patientBirthDate: s.patientBirthDate ?? undefined,
    }));

    return NextResponse.json({ studies });
  } catch (e) {
    console.error('[GET /api/ohif/studies]', e);
    return NextResponse.json(
      { error: 'Failed to fetch studies' },
      { status: 500 }
    );
  }
}

/** POST /api/ohif/studies — add a patient/study. Body: PatientStudy fields. */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      studyInstanceUID,
      patientName,
      patientId,
      mrn,
      studyDate,
      studyTime,
      studyDescription,
      modality,
      accessionNumber,
      instances,
      availableModes,
      patientSex,
      patientBirthDate,
    } = body;

    if (!studyInstanceUID || !patientName || !mrn || !studyDate || !modality || !accessionNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: studyInstanceUID, patientName, mrn, studyDate, modality, accessionNumber' },
        { status: 400 }
      );
    }

    const modes = Array.isArray(availableModes)
      ? (availableModes as string[]).filter((m: string) => VALID_MODES.includes(m as typeof VALID_MODES[number]))
      : ['basic'];
    const inst = Math.max(0, Number(instances) || 0);

    const created = await prisma.ohifStudy.create({
      data: {
        studyInstanceUID: String(studyInstanceUID).trim(),
        patientName: String(patientName).trim(),
        patientId: String(patientId ?? mrn).trim(),
        mrn: String(mrn).trim(),
        studyDate: String(studyDate).trim(),
        studyTime: studyTime ? String(studyTime).trim() : null,
        studyDescription: String(studyDescription ?? '').trim(),
        modality: String(modality).trim(),
        accessionNumber: String(accessionNumber).trim(),
        instances: inst,
        availableModes: modes,
        patientSex: patientSex ? String(patientSex).trim() : null,
        patientBirthDate: patientBirthDate ? String(patientBirthDate).trim() : null,
      },
    });

    return NextResponse.json({
      success: true,
      study: {
        id: created.id,
        studyInstanceUID: created.studyInstanceUID,
        patientName: created.patientName,
        patientId: created.patientId,
        mrn: created.mrn,
        studyDate: created.studyDate,
        studyTime: created.studyTime ?? undefined,
        studyDescription: created.studyDescription,
        modality: created.modality,
        accessionNumber: created.accessionNumber,
        instances: created.instances,
        availableModes: created.availableModes,
        patientSex: created.patientSex ?? undefined,
        patientBirthDate: created.patientBirthDate ?? undefined,
      },
    });
  } catch (e) {
    console.error('[POST /api/ohif/studies]', e);
    return NextResponse.json(
      { error: 'Failed to add study' },
      { status: 500 }
    );
  }
}
