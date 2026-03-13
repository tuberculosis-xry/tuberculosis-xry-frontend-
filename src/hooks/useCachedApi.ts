'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCached, setCached, invalidateUser, CACHE_KEYS } from '@/lib/cacheStorage';
import { getAuthHeaders } from '@/lib/authHeaders';

export type StatsData = {
  totalScans: number;
  tbDetected: number;
  normalResults: number;
  avgConfidence: number | null;
};

export function useCachedStats(userId: string | undefined) {
  const [stats, setStats] = useState<StatsData>({
    totalScans: 0,
    tbDetected: 0,
    normalResults: 0,
    avgConfidence: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);

  const refetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/stats?userId=${encodeURIComponent(userId)}`, { headers });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(true);
        return;
      }
      const next = {
        totalScans: data.stats?.totalScans ?? 0,
        tbDetected: data.stats?.tbDetected ?? 0,
        normalResults: data.stats?.normalResults ?? 0,
        avgConfidence: data.stats?.avgConfidence ?? null,
      };
      setStats(next);
      await setCached(userId, CACHE_KEYS.stats, data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setStats({ totalScans: 0, tbDetected: 0, normalResults: 0, avgConfidence: null });
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const cached = await getCached<{ success: boolean; stats?: StatsData }>(
          userId,
          CACHE_KEYS.stats
        );
        if (cancelled) return;
        if (cached?.data?.stats) {
          setStats({
            totalScans: cached.data.stats.totalScans ?? 0,
            tbDetected: cached.data.stats.tbDetected ?? 0,
            normalResults: cached.data.stats.normalResults ?? 0,
            avgConfidence: cached.data.stats.avgConfidence ?? null,
          });
          setLoading(false);
          refetch();
          return;
        }
        await refetch();
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // refetch used for revalidate; omitting from deps to avoid extra runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return { stats, loading, error, refetch };
}

export type ScanItem = {
  id: string;
  timestamp: string;
  result: string;
  confidence: number;
  patientName: string;
  patientId?: string;
  patientSex?: string;
  patientBirthDate?: string;
  studyDate?: string;
  studyTime?: string;
};

export type ScansResponse = {
  success: boolean;
  scans: ScanItem[];
  nextCursor?: string;
  hasMore?: boolean;
};

export function useCachedScans(
  userId: string | undefined,
  options: { limit: number; cursor?: string | null } = { limit: 50 }
) {
  const { limit, cursor } = options;
  const [scans, setScans] = useState<ScanItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const cacheKey = `scans_${limit}_${cursor ?? 'first'}`;

  const refetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ userId, limit: String(limit) });
      if (cursor) params.set('cursor', cursor);
      const res = await fetch(`/api/scans?${params}`, { headers });
      // 304 has no body; treat as success and keep current state (or skip parse)
      if (res.status === 304) {
        setLoading(false);
        return;
      }
      const data: ScansResponse = await res.json();
      if (!res.ok || !data.success) {
        setError(true);
        return;
      }
      setScans(data.scans ?? []);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
      await setCached(userId, cacheKey, data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [userId, limit, cursor, cacheKey]);

  useEffect(() => {
    if (!userId) {
      setScans([]);
      setNextCursor(null);
      setHasMore(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        let cached: { data: ScansResponse } | null = null;
        try {
          cached = await getCached<ScansResponse>(userId, cacheKey);
        } catch {
          // Corrupt or incompatible cache; ignore and fetch from API
        }
        if (cancelled) return;
        if (cached?.data?.scans) {
          setScans(cached.data.scans);
          setNextCursor(cached.data.nextCursor ?? null);
          setHasMore(cached.data.hasMore ?? false);
          setLoading(false);
          refetch();
          return;
        }
        await refetch();
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // refetch used for revalidate; omitting from deps to avoid extra runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, cacheKey]);

  const loadMore = useCallback(async () => {
    if (!userId || !nextCursor) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const params = new URLSearchParams({ userId, limit: String(limit), cursor: nextCursor });
      const res = await fetch(`/api/scans?${params}`, { headers });
      const data: ScansResponse = await res.json();
      if (!res.ok || !data.success) return;
      setScans((prev) => [...prev, ...(data.scans ?? [])]);
      setNextCursor(data.nextCursor ?? null);
      setHasMore(data.hasMore ?? false);
    } finally {
      setLoading(false);
    }
  }, [userId, limit, nextCursor]);

  return { scans, nextCursor, hasMore, loading, error, refetch, loadMore };
}

export { invalidateUser as invalidateCacheForUser };
