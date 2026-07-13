// Tiny in-memory fixed-window rate limiter. Lives on globalThis so it survives
// route-module reloads within the server process. Intended for abuse throttling
// (login brute-force), not billing-grade accounting — a single-process app, so
// per-process counters are exactly the right scope.

interface Bucket {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __rateBuckets?: Map<string, Bucket> };

function buckets(): Map<string, Bucket> {
  if (!g.__rateBuckets) g.__rateBuckets = new Map();
  return g.__rateBuckets;
}

/** Count one hit against `key`. Returns ok=false once more than `max` hits land
 *  inside the rolling `windowMs`. */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets();
  const cur = b.get(key);
  if (!cur || cur.resetAt <= now) {
    b.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  cur.count++;
  if (cur.count > max) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((cur.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Clear a key's counter — call on a successful auth so a legitimate login
 *  doesn't count toward a future lockout. */
export function clearRateLimit(key: string): void {
  buckets().delete(key);
}

/** Best-effort client IP from proxy headers, for keying limits. */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "local";
}
