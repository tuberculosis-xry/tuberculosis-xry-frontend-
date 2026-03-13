/**
 * GET /api/ohif/dicom-health — App storage (DB) health.
 * Returns { ok, studyCount } for UI status.
 */

import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';

export async function GET() {
  try {
    const studyCount = await prisma.ohifStudy.count();
    return NextResponse.json({
      ok: true,
      studyCount,
      message: 'App storage',
    });
  } catch (e) {
    console.error('[dicom-health]', e);
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : 'DB error' },
      { status: 500 }
    );
  }
}
