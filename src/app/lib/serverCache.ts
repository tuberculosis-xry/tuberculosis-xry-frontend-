/**
 * In-memory server-side cache keyed by userId (and optional suffix).
 * Reduces DB calls until invalidated. For multi-instance, swap to Redis.
 */

const DEFAULT_TTL_SECONDS = 5 * 60; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

function getNow(): number {
  return Date.now();
}

export function get<T>(key: string): T | null {
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;
  if (getNow() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

export function set<T>(key: string, value: T, ttlSeconds: number = DEFAULT_TTL_SECONDS): void {
  const expiresAt = getNow() + ttlSeconds * 1000;
  store.set(key, { value, expiresAt });
}

/** Remove all keys that start with the given prefix (e.g. "scans:userId" and "stats:userId"). */
export function invalidateByPrefix(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

/** Invalidate all cache entries for a user (scans and stats). */
export function invalidateUser(userId: string): void {
  invalidateByPrefix(`scans:${userId}:`);
  invalidateByPrefix(`stats:${userId}`);
}

/** Cache key helpers */
export function scansCacheKey(userId: string, limit: number, cursor: string | null): string {
  return `scans:${userId}:${limit}:${cursor ?? 'first'}`;
}

export function statsCacheKey(userId: string): string {
  return `stats:${userId}`;
}
