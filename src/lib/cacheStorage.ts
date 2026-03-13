/**
 * Client-side encrypted cache (AES-256-GCM) for API responses.
 * Only use in browser; key derived from userId + salt so cache is per-user and not readable in DevTools.
 */

const STORAGE_PREFIX = 'aimpact_enc_';
const PBKDF2_ITERATIONS = 100000;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_ALGORITHM = 'AES-GCM';

function getSalt(): string {
  const envSalt = typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CACHE_SALT;
  if (envSalt && typeof envSalt === 'string') return envSalt;
  return 'aimpact-cache-v1';
}

function storageKey(userId: string, cacheKey: string): string {
  return `${STORAGE_PREFIX}${userId}_${cacheKey}`;
}

export async function deriveKey(uid: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(uid + salt),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: KEY_ALGORITHM, length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encrypt(key: CryptoKey, plaintext: string): Promise<string> {
  const enc = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const encoded = enc.encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: KEY_ALGORITHM, iv, tagLength: AUTH_TAG_LENGTH * 8 },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(key: CryptoKey, ciphertextBase64: string): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertextBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, IV_LENGTH);
  const data = combined.slice(IV_LENGTH);
  const decrypted = await crypto.subtle.decrypt(
    { name: KEY_ALGORITHM, iv, tagLength: AUTH_TAG_LENGTH * 8 },
    key,
    data
  );
  return new TextDecoder().decode(decrypted);
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface CachedPayload<T> {
  data: T;
  timestamp: number;
}

export async function getCached<T>(
  userId: string,
  cacheKey: string
): Promise<CachedPayload<T> | null> {
  const st = getStorage();
  if (!st) return null;
  const key = storageKey(userId, cacheKey);
  const raw = st.getItem(key);
  if (!raw) return null;
  const salt = getSalt();
  try {
    const cryptoKey = await deriveKey(userId, salt);
    const decrypted = await decrypt(cryptoKey, raw);
    const parsed = JSON.parse(decrypted) as CachedPayload<T>;
    if (parsed && typeof parsed.data !== 'undefined' && typeof parsed.timestamp === 'number') {
      return parsed;
    }
  } catch {
    st.removeItem(key);
    return null;
  }
  return null;
}

export async function setCached(
  userId: string,
  cacheKey: string,
  value: unknown
): Promise<void> {
  const st = getStorage();
  if (!st) return;
  const salt = getSalt();
  try {
    const cryptoKey = await deriveKey(userId, salt);
    const payload: CachedPayload<unknown> = { data: value, timestamp: Date.now() };
    const encrypted = await encrypt(cryptoKey, JSON.stringify(payload));
    st.setItem(storageKey(userId, cacheKey), encrypted);
  } catch {
    // e.g. quota exceeded or crypto unavailable
  }
}

/** Remove all encrypted cache entries for a user. */
export function invalidateUser(userId: string): void {
  const st = getStorage();
  if (!st) return;
  const prefix = `${STORAGE_PREFIX}${userId}_`;
  const toRemove: string[] = [];
  for (let i = 0; i < st.length; i++) {
    const key = st.key(i);
    if (key && key.startsWith(prefix)) toRemove.push(key);
  }
  toRemove.forEach((k) => st.removeItem(k));
}

/** Cache key constants for scans and stats. */
export const CACHE_KEYS = {
  scans: 'scans',
  stats: 'stats',
} as const;
