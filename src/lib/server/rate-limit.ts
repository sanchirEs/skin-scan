// Fixed-window limiter kept in memory. On serverless it is per instance,
// which is enough to blunt casual abuse; use a shared store if that changes.
const windows = new Map<string, { start: number; count: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const w = windows.get(key);
  if (!w || now - w.start >= windowMs) {
    windows.set(key, { start: now, count: 1 });
    if (windows.size > 5000) {
      for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
    }
    return true;
  }
  w.count++;
  return w.count <= limit;
}

export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

/** Reads a JSON body no larger than maxBytes. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const text = await req.text();
  if (text.length > maxBytes) throw new Error("too-large");
  return JSON.parse(text);
}
