/**
 * Returns current epoch timestamp in milliseconds.
 */
export function nowMs(): number {
  return Date.now();
}

/**
 * Checks whether an expiration timestamp has passed.
 */
export function isExpired(expiresAt: number | null, currentTimeMs = Date.now()): boolean {
  if (expiresAt === null) {
    return false;
  }
  return currentTimeMs >= expiresAt;
}

/**
 * Converts a TTL in seconds into an absolute expiration timestamp in milliseconds.
 * Returns null if ttl is undefined or <= 0 (treated as non-expiring).
 */
export function ttlToExpiresAt(ttlSec?: number, fromTimeMs = Date.now()): number | null {
  if (ttlSec === undefined || ttlSec === null || ttlSec <= 0) {
    return null;
  }
  return fromTimeMs + Math.round(ttlSec * 1000);
}

/**
 * Calculates remaining TTL in seconds from an absolute expiration timestamp.
 * Returns null for non-expiring keys, or 0 if already expired.
 */
export function remainingTtlSec(expiresAt: number | null, fromTimeMs = Date.now()): number | null {
  if (expiresAt === null) {
    return null;
  }
  const diffMs = expiresAt - fromTimeMs;
  if (diffMs <= 0) {
    return 0;
  }
  return Math.ceil(diffMs / 1000);
}
