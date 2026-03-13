import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';
import { checkRateLimit, getRateLimitId } from '@/app/lib/rateLimit';
import { get, set, invalidateUser, scansCacheKey } from '@/app/lib/serverCache';
import { getAuthenticatedUserId } from '@/app/lib/firebaseAdmin';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * GET /api/scans?limit=50&cursor=...
 * Returns paginated scan history for the authenticated user (Firebase UID from token).
 * Supports cursor-based pagination for 10M+ scale; limit and cursor are optional.
 * Requires Authorization: Bearer <Firebase ID token>.
 */
export async function GET(request: Request) {
  try {
    const authResult = await getAuthenticatedUserId(request);
    if ('error' in authResult) return authResult.error;
    const userId = authResult.uid;

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const cursor = searchParams.get('cursor');

    const rl = checkRateLimit(getRateLimitId(request, userId), 'read');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const limit = Math.min(
      Math.max(1, parseInt(limitParam ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT),
      MAX_LIMIT
    );

    const cacheKey = scansCacheKey(userId, limit, cursor);
    const cached = get<{ success: true; scans: unknown[]; nextCursor?: string; hasMore?: boolean }>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    const findManyArgs: Parameters<typeof prisma.tuberculosisDiagnosis.findMany>[0] = {
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit + 1,
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
      },
    };

    if (cursor) {
      findManyArgs.cursor = { id: cursor };
      findManyArgs.skip = 1;
    }

    const scans = await prisma.tuberculosisDiagnosis.findMany(findManyArgs);

    const hasMore = scans.length > limit;
    const items = hasMore ? scans.slice(0, limit) : scans;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    const list = items.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      result: s.class,
      confidence: s.confidenceScore * 100,
      patientName: s.patientName ?? 'Anonymous',
      patientId: s.patientId ?? undefined,
      patientSex: s.patientSex ?? undefined,
      patientBirthDate: s.patientBirthDate ?? undefined,
      studyDate: s.studyDate ?? undefined,
      studyTime: s.studyTime ?? undefined,
    }));

    const response = {
      success: true as const,
      scans: list,
      nextCursor: nextCursor ?? undefined,
      hasMore: hasMore ?? undefined,
    };
    set(cacheKey, response);
    return NextResponse.json(response);
  } catch (e) {
    console.error('[GET /api/scans]', e);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch scans' },
      { status: 500 }
    );
  }
}

const MAX_IMAGE_BYTES = 12 * 1024 * 1024; // 12MB decoded (align with backend MAX_FILE_SIZE_MB)
const VALID_CLASSES = ['normal', 'tuberculosis'] as const;

/**
 * POST /api/scans
 * Body: { class, confidenceScore, patientName?, patientId?, patientSex?, patientBirthDate?, studyDate?, studyTime?, imageBase64 }
 * Saves a new scan to MongoDB for the authenticated user. Validates input for production safety.
 * Requires Authorization: Bearer <Firebase ID token>.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const authResult = await getAuthenticatedUserId(request, body.userId);
    if ('error' in authResult) return authResult.error;
    const userId = authResult.uid;

    const {
      class: resultClass,
      confidenceScore,
      patientName,
      patientId,
      patientSex,
      patientBirthDate,
      studyDate,
      studyTime,
      imageBase64,
    } = body;

    const rl = checkRateLimit(getRateLimitId(request, userId), 'write');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }
    if (resultClass == null || !VALID_CLASSES.includes(resultClass)) {
      return NextResponse.json(
        { error: 'class is required and must be "normal" or "tuberculosis"' },
        { status: 400 }
      );
    }
    const score = Number(confidenceScore);
    if (Number.isNaN(score) || score < 0 || score > 1) {
      return NextResponse.json(
        { error: 'confidenceScore must be a number between 0 and 1' },
        { status: 400 }
      );
    }
    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return NextResponse.json(
        { error: 'imageBase64 is required' },
        { status: 400 }
      );
    }

    const base64Data = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;
    const imageBuffer = Buffer.from(base64Data, 'base64');
    if (imageBuffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: `Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB)` },
        { status: 413 }
      );
    }

    const scan = await prisma.tuberculosisDiagnosis.create({
      data: {
        userId,
        class: resultClass,
        confidenceScore: score,
        patientName: patientName ?? 'Anonymous',
        patientId: patientId ?? undefined,
        patientSex: patientSex ?? undefined,
        patientBirthDate: patientBirthDate ?? undefined,
        studyDate: studyDate ?? undefined,
        studyTime: studyTime ?? undefined,
        image: imageBuffer,
      },
    });

    invalidateUser(userId);

    return NextResponse.json({
      success: true,
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
      },
    });
  } catch (e) {
    console.error('[POST /api/scans]', e);
    return NextResponse.json(
      { error: 'Failed to save scan' },
      { status: 500 }
    );
  }
}
