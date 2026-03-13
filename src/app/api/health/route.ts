import { NextResponse } from 'next/server';
import prisma from '@/app/lib/prisma';

const HEALTH_TIMEOUT_MS = 5_000;

/**
 * GET /api/health
 * Returns 200 if the app and (optionally) backend and DB are reachable.
 * Use for load balancers and runbooks.
 */
export async function GET() {
  const backendUrl =
    process.env.MODEL_BACKEND ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:8000';
  const payload: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    frontend: boolean;
    backend?: boolean;
    database?: boolean;
    backendUrl?: string;
    timestamp: string;
  } = {
    status: 'healthy',
    frontend: true,
    timestamp: new Date().toISOString(),
  };

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    const res = await fetch(`${backendUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    }).finally(() => clearTimeout(id));
    payload.backend = res.ok;
    if (!res.ok) payload.status = 'degraded';
  } catch {
    payload.backend = false;
    payload.status = 'degraded';
  }

  try {
    await prisma.tuberculosisDiagnosis.findFirst({ select: { id: true }, take: 1 });
    payload.database = true;
  } catch {
    payload.database = false;
    payload.status = payload.status === 'healthy' ? 'degraded' : 'unhealthy';
  }

  const statusCode =
    payload.status === 'unhealthy' ? 503 : payload.status === 'degraded' ? 200 : 200;
  return NextResponse.json(payload, { status: statusCode });
}
