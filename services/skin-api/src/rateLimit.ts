export type RateDecision = { ok: true } | { ok: false; retryAfterSec: number };

/** In-memory sliding-window limiter: at most `limit` hits per key per `windowMs`. */
export function createRateLimiter(limit: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();

  function sweep(now: number) {
    for (const [key, times] of hits) {
      if (times.at(-1)! <= now - windowMs) hits.delete(key);
    }
  }

  return {
    hit(key: string, now: number): RateDecision {
      if (hits.size > 10_000) sweep(now);
      const recent = (hits.get(key) ?? []).filter((t) => t > now - windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0]! + windowMs - now) / 1000)) };
      }
      recent.push(now);
      hits.set(key, recent);
      return { ok: true };
    },
  };
}
