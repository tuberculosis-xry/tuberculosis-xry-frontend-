'use client';

import { auth } from '@/lib/firebase';

/**
 * Returns headers with Authorization: Bearer <Firebase ID token> for API requests.
 * Use when calling /api/scans, /api/stats, etc. so the server can verify the user.
 */
export async function getAuthHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) return {};
  try {
    const token = await user.getIdToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}
