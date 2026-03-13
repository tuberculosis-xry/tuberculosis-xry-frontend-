/**
 * In-memory rate limiter for API routes.
 * Keyed by identifier (userId or IP). For multi-instance deployment, swap to Redis (e.g. @upstash/ratelimit).
 */

const READ_LIMIT = parseInt(process.env.RATE_LIMIT_READ_PER_MIN ?? '60', 10) || 60;
const WRITE_LIMIT = parseInt(process.env.RATE_LIMIT_WRITE_PER_MIN ?? '20', 10) || 20;
const WINDOW_MS = 60 * 1000; // 1 minute

type Kind = 'read' | 'write';

interface Entry {
  read: number[];
  write: number[];
}

const store = new Map<string, Entry>();

function getNow(): number {
  return Date.now();
}

function prune(entry: Entry, now: number): void {
  const cutoff = now - WINDOW_MS;
  entry.read = entry.read.filter((t) => t > cutoff);
  entry.write = entry.write.filter((t) => t > cutoff);
}

export function checkRateLimit(
  identifier: string,
  kind: Kind
): { allowed: boolean; retryAfter?: number } {
  if (!identifier) {
    return { allowed: true };
  }
  const now = getNow();
  let entry = store.get(identifier);
  if (!entry) {
    entry = { read: [], write: [] };
    store.set(identifier, entry);
  }
  prune(entry, now);
  const limit = kind === 'read' ? READ_LIMIT : WRITE_LIMIT;
  const timestamps = kind === 'read' ? entry.read : entry.write;
  if (timestamps.length >= limit) {
    const oldest = Math.min(...timestamps);
    const retryAfter = Math.ceil((oldest + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter: Math.max(1, retryAfter) };
  }
  timestamps.push(now);
  return { allowed: true };
}

/** Resolve identifier for rate limiting: userId when available, else IP from headers. */
export function getRateLimitId(request: Request, userId?: string | null): string {
  if (userId && typeof userId === 'string') {
    return `user:${userId}`;
  }
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : request.headers.get('x-real-ip') ?? 'unknown';
  return `ip:${ip}`;
}
