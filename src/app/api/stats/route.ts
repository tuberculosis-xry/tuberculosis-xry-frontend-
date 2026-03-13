import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';
import { checkRateLimit, getRateLimitId } from '@/app/lib/rateLimit';
import { get, set, statsCacheKey } from '@/app/lib/serverCache';
import { jsonWithETag } from '@/app/lib/etag';
import { getAuthenticatedUserId } from '@/app/lib/firebaseAdmin';

/**
 * GET /api/stats
 * Returns aggregated stats for the authenticated user (Firebase UID from token).
 * Scales to 10M+ users without loading all scans into memory.
 * Requires Authorization: Bearer <Firebase ID token>.
 */
export async function GET(request: Request) {
  try {
    const authResult = await getAuthenticatedUserId(request);
    if ('error' in authResult) return authResult.error;
    const userId = authResult.uid;

    const rl = checkRateLimit(getRateLimitId(request, userId), 'read');
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }

    const cacheKey = statsCacheKey(userId);
    const cached = get<{ success: true; stats: Record<string, unknown> }>(cacheKey);
    if (cached) {
      return jsonWithETag(request, cached);
    }

    const where = { userId };

    const [totals, byClass] = await Promise.all([
      prisma.tuberculosisDiagnosis.groupBy({
        by: ['userId'],
        where,
        _count: true,
        _avg: { confidenceScore: true },
      }),
      prisma.tuberculosisDiagnosis.groupBy({
        by: ['class'],
        where,
        _count: true,
      }),
    ]);

    const totalRow = totals[0];
    const totalScans = totalRow?._count ?? 0;
    const avgConfidenceRaw = totalRow?._avg?.confidenceScore ?? null;
    const avgConfidence =
      avgConfidenceRaw != null ? Math.round(avgConfidenceRaw * 1000) / 10 : null;

    const tbRow = byClass.find((r) => r.class === 'tuberculosis');
    const normalRow = byClass.find((r) => r.class === 'normal');
    const tbDetected = tbRow?._count ?? 0;
    const normalResults = normalRow?._count ?? 0;

    const response = {
      success: true as const,
      stats: {
        totalScans,
        tbDetected,
        normalResults,
        avgConfidence,
      },
    };
    set(cacheKey, response);
    return jsonWithETag(request, response);
  } catch (e) {
    console.error('[GET /api/stats]', e);
    return NextResponse.json(
      { error: 'Failed to fetch stats' },
      { status: 500 }
    );
  }
}
