/**
 * STOW: store measurement report (store back results).
 * Persists to app DB (OhifMeasurementReport). Optional forward to PACS STOW-RS can be added when configured.
 */

import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';
import { getAuthenticatedUserId } from '@/app/lib/firebaseAdmin';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { studyInstanceUID, measurements, userId: bodyUserId } = body as {
      studyInstanceUID?: string;
      measurements?: Array<{ id: string; type: string; value: string; unit?: string; viewportIndex: number; createdAt: number }>;
      userId?: string;
    };

    if (!studyInstanceUID || !measurements?.length) {
      return NextResponse.json(
        { success: false, error: 'studyInstanceUID and measurements array required' },
        { status: 400 }
      );
    }

    const authResult = await getAuthenticatedUserId(request, bodyUserId);
    if ('error' in authResult) return authResult.error;
    const userId = authResult.uid;

    await prisma.ohifMeasurementReport.create({
      data: {
        studyInstanceUID,
        userId,
        payload: JSON.stringify({ measurements }),
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Measurement report stored',
      studyInstanceUID,
      measurementCount: measurements.length,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'STOW request failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
