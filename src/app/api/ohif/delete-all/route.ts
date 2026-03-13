/**
 * POST /api/ohif/delete-all
 * Deletes all DICOM instances and all OhifStudy rows from the database.
 */

import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';

/** Prisma client including OhifInstance (run `npx prisma generate`). Cast when TS types are stale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { ohifInstance: any };

export async function POST() {
  try {
    const [instanceResult, studyResult] = await Promise.all([
      db.ohifInstance.deleteMany({}),
      prisma.ohifStudy.deleteMany({}),
    ]);
    const deletedInstances = instanceResult.count;
    const deletedFromDb = studyResult.count;
    return NextResponse.json({
      deletedFromDb,
      deletedInstances,
      message: `Deleted ${deletedInstances} instances and ${deletedFromDb} studies from database.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[delete-all]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
