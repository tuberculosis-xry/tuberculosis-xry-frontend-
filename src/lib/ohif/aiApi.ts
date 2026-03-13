/**
 * OHIF AI inference API client.
 * Base URL from NEXT_PUBLIC_OHIF_AI_API_URL. No TB-specific wording.
 *
 * Backend contract (for a separate AI service to implement):
 *
 * POST {baseUrl}/infer (or /run, /analyze - configurable)
 * Request body: { studyInstanceUID?, seriesInstanceUID?, instanceId?, viewportIndex?, task? }
 * Response 200: { report?: string, overlays?: unknown }
 * - report: plain text or markdown for display in AI panel
 * - overlays: optional (e.g. { segments: [...], boxes: [...] }) for viewport overlay; format is backend-specific
 * Response 4xx/5xx: error message in body or standard HTTP status
 */

import type { AIInferenceRequest, AIInferenceResult } from './types';

function getBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return (process.env.NEXT_PUBLIC_OHIF_AI_API_URL ?? '').replace(/\/$/, '');
}

export function isAIConfigured(): boolean {
  return Boolean(getBaseUrl());
}

export async function runInference(request: AIInferenceRequest): Promise<AIInferenceResult> {
  const base = getBaseUrl();
  if (!base) {
    return {
      report: 'AI API URL is not configured. Set NEXT_PUBLIC_OHIF_AI_API_URL to your inference endpoint.',
    };
  }

  const url = `${base}/infer`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const json = JSON.parse(text);
      if (json.message) message = json.message;
      else if (json.error) message = json.error;
    } catch {
      // use text as message
    }
    throw new Error(message || `AI request failed: ${res.status}`);
  }

  const data = (await res.json()) as AIInferenceResult;
  return data;
}
