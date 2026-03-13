/**
 * DICOM viewport annotations API: load/save per-instance annotations (drawings, shapes, comments, marks).
 * Keyed by studyInstanceUID + seriesInstanceUID + sopInstanceUID + userId.
 */

import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';
import { getAuthenticatedUserId } from '@/app/lib/firebaseAdmin';

/** GET /api/ohif/annotations?studyInstanceUID=...&userId=... (userId for dev fallback)
 * Returns one annotation record per DICOM instance (study+series+sop). Each file is separate.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const studyInstanceUID = searchParams.get('studyInstanceUID')?.trim();
    const userIdParam = searchParams.get('userId')?.trim();

    if (!studyInstanceUID) {
      return NextResponse.json(
        { error: 'studyInstanceUID is required' },
        { status: 400 }
      );
    }

    const authResult = await getAuthenticatedUserId(request, userIdParam);
    if ('error' in authResult) return authResult.error;
    const userId = authResult.uid;

    const list = await prisma.ohifViewportAnnotation.findMany({
      where: { studyInstanceUID, userId },
      select: { seriesInstanceUID: true, sopInstanceUID: true, payload: true },
    });

    const items = list.map((row) => ({
      seriesInstanceUID: row.seriesInstanceUID,
      sopInstanceUID: row.sopInstanceUID,
      payload: row.payload,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load annotations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST /api/ohif/annotations — upsert one DICOM instance's annotation payload only.
 * One request = one instance. Never merges or mixes with other instances.
 * Body: { studyInstanceUID, seriesInstanceUID, sopInstanceUID, payload, userId? (dev) }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      studyInstanceUID,
      seriesInstanceUID,
      sopInstanceUID,
      payload,
      userId: bodyUserId,
    } = body as {
      studyInstanceUID?: string;
      seriesInstanceUID?: string;
      sopInstanceUID?: string;
      payload?: string;
      userId?: string | null;
    };

    if (
      !studyInstanceUID?.trim() ||
      !seriesInstanceUID?.trim() ||
      !sopInstanceUID?.trim()
    ) {
      return NextResponse.json(
        { error: 'studyInstanceUID, seriesInstanceUID, and sopInstanceUID are required' },
        { status: 400 }
      );
    }

    if (typeof payload !== 'string') {
      return NextResponse.json(
        { error: 'payload must be a JSON string' },
        { status: 400 }
      );
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(payload);
    } catch {
      return NextResponse.json(
        { error: 'payload must be valid JSON' },
        { status: 400 }
      );
    }
    if (!Array.isArray(parsedPayload)) {
      return NextResponse.json(
        { error: 'payload must be a JSON array of annotation items' },
        { status: 400 }
      );
    }

    const authResult = await getAuthenticatedUserId(request, bodyUserId ?? null);
    if ('error' in authResult) return authResult.error;
    const userId = authResult.uid;

    const normalizedPayload = JSON.stringify(parsedPayload);

    const updated = await prisma.ohifViewportAnnotation.upsert({
      where: {
        studyInstanceUID_seriesInstanceUID_sopInstanceUID_userId: {
          studyInstanceUID: studyInstanceUID.trim(),
          seriesInstanceUID: seriesInstanceUID.trim(),
          sopInstanceUID: sopInstanceUID.trim(),
          userId,
        },
      },
      create: {
        studyInstanceUID: studyInstanceUID.trim(),
        seriesInstanceUID: seriesInstanceUID.trim(),
        sopInstanceUID: sopInstanceUID.trim(),
        userId,
        payload: normalizedPayload,
      },
      update: { payload: normalizedPayload },
    });

    return NextResponse.json({
      success: true,
      seriesInstanceUID: updated.seriesInstanceUID,
      sopInstanceUID: updated.sopInstanceUID,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to save annotations';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
