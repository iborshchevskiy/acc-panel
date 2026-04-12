/**
 * Simple in-process rate limiter using a sliding-window counter.
 * Sufficient for single-instance deployments; for multi-instance
 * replace the Map store with Vercel KV or Upstash Redis.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

/** Clean up expired entries periodically (every ~5 min) */
let lastClean = Date.now();
function maybeClean() {
  const now = Date.now();
  if (now - lastClean < 5 * 60 * 1000) return;
  lastClean = now;
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}

/**
 * Returns true if the request should be rate-limited (i.e. limit exceeded).
 * @param key   Unique identifier (e.g. userId + endpoint)
 * @param limit Max requests per window
 * @param windowMs Window duration in milliseconds
 */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  maybeClean();
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  entry.count++;
  if (entry.count > limit) return true;
  return false;
}
