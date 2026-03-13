/**
 * Server-side Firebase Admin: verify ID tokens and resolve authenticated user.
 * Used by /api/scans and /api/stats to ensure requests are from the claimed user.
 *
 * Env (production): FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 * Or set GOOGLE_APPLICATION_CREDENTIALS to path of service account JSON.
 */

import { NextResponse } from 'next/server';
import admin from 'firebase-admin';

/** Request-like type for route handlers (headers, url, method). */
type AuthRequest = { headers: Headers; url: string; method: string };

let adminApp: admin.app.App | null = null;

function getAdminApp(): admin.app.App | null {
  if (adminApp) return adminApp;
  try {
    if (admin.apps.length > 0) {
      adminApp = admin.app();
      return adminApp;
    }
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (projectId && clientEmail && privateKey) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
      return adminApp;
    }
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      adminApp = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
      return adminApp;
    }
  } catch {
    // Not configured or init failed
  }
  return null;
}

/**
 * Extract Bearer token from Authorization header.
 */
function getBearerToken(request: AuthRequest): string | null {
  const auth = request.headers.get('authorization');
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

/**
 * Development-only: when Firebase Admin is not configured, trust auth-session cookie
 * and client-supplied userId (query for GET, or pass from body for POST via getAuthenticatedUserId(request, bodyUserId)).
 */
function getDevFallbackUserId(request: AuthRequest, bodyUserId?: string | null): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  const cookie = request.headers.get('cookie') || '';
  if (!cookie.includes('auth-session=')) return null;
  if (bodyUserId && typeof bodyUserId === 'string' && bodyUserId.length > 0) return bodyUserId;
  if (request.method === 'GET') {
    try {
      const userId = new URL(request.url).searchParams.get('userId');
      return userId && userId.length > 0 ? userId : null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Verify the request's Firebase ID token and return the authenticated user's UID.
 * Returns { uid } on success, or { error: NextResponse } for 401/503.
 * In development, when Firebase Admin is not configured, falls back to auth-session cookie + userId (from query for GET, or pass bodyUserId for POST).
 */
export async function getAuthenticatedUserId(
  request: AuthRequest,
  bodyUserId?: string | null
): Promise<{ uid: string } | { error: NextResponse }> {
  const app = getAdminApp();
  if (!app) {
    const devUid = getDevFallbackUserId(request, bodyUserId);
    if (devUid) return { uid: devUid };
    return {
      error: NextResponse.json(
        { error: 'Authentication not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (or GOOGLE_APPLICATION_CREDENTIALS) for production, or use development mode.' },
        { status: 503 }
      ),
    };
  }
  const token = getBearerToken(request);
  if (!token) {
    const devUid = getDevFallbackUserId(request, bodyUserId);
    if (devUid) return { uid: devUid };
    return {
      error: NextResponse.json(
        { error: 'Missing or invalid Authorization header' },
        { status: 401 }
      ),
    };
  }
  try {
    const decoded = await admin.auth(app).verifyIdToken(token);
    const uid = decoded.uid;
    if (!uid) {
      return {
        error: NextResponse.json(
          { error: 'Invalid token' },
          { status: 401 }
        ),
      };
    }
    return { uid };
  } catch {
    return {
      error: NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      ),
    };
  }
}
