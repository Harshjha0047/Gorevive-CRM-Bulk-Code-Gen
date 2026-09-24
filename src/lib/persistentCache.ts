/**
 * Small localStorage-backed cache with a TTL, used to persist master/dynamic
 * dropdown data (from the legacy CRM) across page reloads and browser tabs —
 * not just in-memory for the current session.
 *
 * Falls back to acting like a no-op cache if localStorage is unavailable
 * (e.g. private browsing with storage disabled) so callers never crash.
 */

const PREFIX = 'gorevive_cache:';

interface CacheEntry<T> {
  value: T;
  expiresAt: number; // epoch ms
}

function isStorageAvailable(): boolean {
  try {
    const testKey = `${PREFIX}__test__`;
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

const storageAvailable = isStorageAvailable();

export function getCached<T>(key: string): T | null {
  if (!storageAvailable) return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() > entry.expiresAt) {
      window.localStorage.removeItem(PREFIX + key);
      return null;
    }
    return entry.value;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  if (!storageAvailable) return;
  try {
    const entry: CacheEntry<T> = { value, expiresAt: Date.now() + ttlMs };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch {
    // Quota exceeded or serialization error — caching is a pure optimization,
    // so just skip it rather than throwing.
  }
}

/** Clears every entry this module wrote, e.g. on logout. */
export function clearAllCached(): void {
  if (!storageAvailable) return;
  try {
    Object.keys(window.localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

/** Default freshness window for CRM dropdown/master data. */
export const MASTER_DATA_TTL_MS = 30 * 60 * 1000; // 30 minutes
