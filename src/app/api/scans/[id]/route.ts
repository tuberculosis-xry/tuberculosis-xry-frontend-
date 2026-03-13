import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';
import { checkRateLimit, getRateLimitId } from '@/app/lib/rateLimit';
import { getAuthenticatedUserId } from '@/app/lib/firebaseAdmin';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/scans/[id]
 * Returns a single scan by id with image (base64 data URL).
 * Ensures the scan belongs to the authenticated user (Firebase UID from token).
 * Requires Authorization: Bearer <Firebase ID token>.
 */
export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const authResult = await getAuthenticatedUserId(request);
    if ('error' in authResult) return authResult.error;
    const userId = authResult.uid;

    const { id } = await context.params;

    const rl = checkRateLimit(getRateLimitId(request, userId), 'read');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const scan = await prisma.tuberculosisDiagnosis.findFirst({
      where: { id, userId },
      select: {
        id: true,
        timestamp: true,
        class: true,
        confidenceScore: true,
        patientName: true,
        patientId: true,
        patientSex: true,
        patientBirthDate: true,
        studyDate: true,
        studyTime: true,
        image: true,
      },
    });

    if (!scan) {
      return NextResponse.json(
        { error: 'Scan not found' },
        { status: 404 }
      );
    }

    const imageBuffer = Buffer.from(scan.image);
    const imageBase64 = imageBuffer.toString('base64');
    const imageDataUrl = `data:image/png;base64,${imageBase64}`;

    return NextResponse.json({
      success: true as const,
      scan: {
        id: scan.id,
        timestamp: scan.timestamp,
        result: scan.class,
        confidence: scan.confidenceScore * 100,
        patientName: scan.patientName ?? 'Anonymous',
        patientId: scan.patientId ?? undefined,
        patientSex: scan.patientSex ?? undefined,
        patientBirthDate: scan.patientBirthDate ?? undefined,
        studyDate: scan.studyDate ?? undefined,
        studyTime: scan.studyTime ?? undefined,
        imageDataUrl,
      },
    });
  } catch (e) {
    console.error('[GET /api/scans/[id]]', e);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch scan' },
      { status: 500 }
    );
  }
}
