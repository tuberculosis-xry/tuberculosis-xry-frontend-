/**
 * Saved measurements API: load/save full Measurement[] per study + user (Save button).
 * Payload includes geometry and imageId so measurements can be re-drawn on the canvas.
 */

import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';
import { getAuthenticatedUserId } from '@/app/lib/firebaseAdmin';

/** GET /api/ohif/measurements?studyInstanceUID=...&userId=... (userId for dev fallback)
 * Returns saved measurements for the given study and current user, or empty array.
 * Never returns 500: on any error returns 200 with measurements: [] so the viewer always loads.
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

    let record: { payload: string } | null = null;
    try {
      record = await prisma.ohifSavedMeasurements.findUnique({
        where: {
          studyInstanceUID_userId: {
            studyInstanceUID,
            userId,
          },
        },
        select: { payload: true },
      });
    } catch (dbError) {
      console.error('[GET /api/ohif/measurements]', dbError);
      return NextResponse.json({ measurements: [] });
    }

    if (!record) {
      return NextResponse.json({ measurements: [] });
    }

    let measurements: unknown;
    try {
      measurements = JSON.parse(record.payload);
    } catch {
      return NextResponse.json({ measurements: [] });
    }
    if (!Array.isArray(measurements)) {
      return NextResponse.json({ measurements: [] });
    }

    return NextResponse.json({ measurements });
  } catch (e) {
    console.error('[GET /api/ohif/measurements]', e);
    return NextResponse.json({ measurements: [] });
  }
}

/** POST /api/ohif/measurements — upsert saved measurements for study + user.
 * Body: { studyInstanceUID: string, measurements: Measurement[], userId? (dev) }
 * Stores full Measurement[] (including geometry, imageId) for canvas re-draw.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      studyInstanceUID,
      measurements,
      userId: bodyUserId,
    } = body as {
      studyInstanceUID?: string;
      measurements?: unknown;
      userId?: string | null;
    };

    if (!studyInstanceUID?.trim()) {
      return NextResponse.json(
        { error: 'studyInstanceUID is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(measurements)) {
      return NextResponse.json(
        { error: 'measurements must be an array' },
        { status: 400 }
      );
    }

    const authResult = await getAuthenticatedUserId(request, bodyUserId ?? null);
    if ('error' in authResult) return authResult.error;
    const userId = authResult.uid;

    const payload = JSON.stringify(measurements);

    await prisma.ohifSavedMeasurements.upsert({
      where: {
        studyInstanceUID_userId: {
          studyInstanceUID: studyInstanceUID.trim(),
          userId,
        },
      },
      create: {
        studyInstanceUID: studyInstanceUID.trim(),
        userId,
        payload,
      },
      update: { payload },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to save measurements';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
