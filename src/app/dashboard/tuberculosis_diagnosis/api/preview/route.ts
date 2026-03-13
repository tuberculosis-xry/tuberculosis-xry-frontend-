import { NextResponse } from 'next/server';
import { checkRateLimit, getRateLimitId } from '@/app/lib/rateLimit';

export async function POST(req: Request) {
  const MODEL_BACKEND = process.env.MODEL_BACKEND || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  try {
    const rl = checkRateLimit(getRateLimitId(req), 'write');
    if (!rl.allowed) {
      return NextResponse.json(
        { success: false, message: 'Too many requests', retryAfter: rl.retryAfter },
        { status: 429, headers: { 'Retry-After': String(rl.retryAfter ?? 60) } }
      );
    }
    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json({ success: false, message: 'No file provided' }, { status: 400 });
    }

    const uploadFormData = new FormData();
    uploadFormData.append('image', file, file.name);

    const response = await fetch(`${MODEL_BACKEND}/preview`, {
      method: 'POST',
      body: uploadFormData,
    });

    if (!response.ok) {
      const errorResponse = await response.json().catch(() => ({ detail: 'Preview failed' }));
      return NextResponse.json(
        { success: false, message: errorResponse.detail || 'Preview failed' },
        { status: response.status }
      );
    }

    const jsonResponse = await response.json();
    return NextResponse.json({
      success: jsonResponse.success === true,
      image_base64: jsonResponse.image_base64 ?? undefined,
    });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Backend connection failed. Ensure the FastAPI backend is running.' },
      { status: 502 }
    );
  }
}
