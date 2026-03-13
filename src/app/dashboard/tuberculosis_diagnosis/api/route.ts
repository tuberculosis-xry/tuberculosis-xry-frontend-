import { NextResponse } from "next/server";
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
            return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });
        }

        // Create a new FormData instance to send to the backend
        const uploadFormData = new FormData();
        uploadFormData.append('image', file, file.name);

        const requestId = crypto.randomUUID();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60_000);
        const response = await fetch(`${MODEL_BACKEND}/predict`, {
            method: 'POST',
            body: uploadFormData,
            signal: controller.signal,
            headers: { 'X-Request-ID': requestId },
        }).finally(() => clearTimeout(timeoutId));

        if (!response.ok) {
            const errorResponse = await response.json().catch(() => ({ error: 'Unknown error' }));
            return NextResponse.json(
                { success: false, message: "Prediction failed", error: errorResponse },
                { status: response.status }
            );
        }

        const jsonResponse = await response.json();
        const nextRes = NextResponse.json({
            success: jsonResponse.success || true,
            prediction: jsonResponse.prediction,
            patient_info: jsonResponse.patient_info ?? undefined,
            image_base64: jsonResponse.image_base64 ?? undefined,
        });
        nextRes.headers.set('X-Request-ID', requestId);
        return nextRes;
    } catch {
        return NextResponse.json(
            { success: false, message: "Backend connection failed. Ensure the FastAPI backend is running." },
            { status: 502 }
        );
    }
}
