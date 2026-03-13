import { createHash } from 'crypto';
import { NextResponse } from 'next/server';

/** Compute a weak ETag from a JSON-serializable body. */
export function computeETag(body: unknown): string {
  const str = JSON.stringify(body);
  return createHash('md5').update(str).digest('hex');
}

/**
 * Return 304 Not Modified if request If-None-Match matches body's ETag,
 * otherwise return 200 with body and ETag header.
 */
export function jsonWithETag(
  request: Request,
  body: unknown
): NextResponse {
  const etag = computeETag(body);
  const ifNoneMatch = request.headers.get('if-none-match')?.trim();
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: { ETag: etag },
    });
  }
  return NextResponse.json(body, {
    headers: { ETag: etag },
  });
}
