import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';

/** Prisma client including OhifInstance (run `npx prisma generate`). Cast when TS types are stale. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as typeof prisma & { ohifInstance: any };

/** PATCH /api/ohif/studies/[id] — update study description only. Body: { studyDescription: string }. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing study id' }, { status: 400 });
    }
    const body = await request.json();
    const studyDescription =
      typeof body?.studyDescription === 'string' ? body.studyDescription.trim() : null;
    if (studyDescription === null) {
      return NextResponse.json(
        { error: 'Missing or invalid studyDescription in body' },
        { status: 400 }
      );
    }
    await prisma.ohifStudy.update({
      where: { id },
      data: { studyDescription },
    });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[PATCH /api/ohif/studies/:id]', e);
    return NextResponse.json(
      { error: 'Failed to update study description' },
      { status: 500 }
    );
  }
}

/** DELETE /api/ohif/studies/[id] — delete all instances for this study from DB, then delete the study. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'Missing study id' }, { status: 400 });
    }

    const study = await prisma.ohifStudy.findUnique({
      where: { id },
      select: { studyInstanceUID: true },
    });
    if (!study) {
      return NextResponse.json({ error: 'Study not found' }, { status: 404 });
    }

    await db.ohifInstance.deleteMany({
      where: { studyInstanceUID: study.studyInstanceUID },
    });
    await prisma.ohifStudy.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[DELETE /api/ohif/studies/:id]', e);
    return NextResponse.json(
      { error: 'Failed to delete study' },
      { status: 500 }
    );
  }
}
