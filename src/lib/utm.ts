// Which post or campaign a visitor came from. sessionStorage only, no cookies.
export type Utm = { source?: string; medium?: string; campaign?: string };
const KEY = "skin-check:utm";

export function captureUtm(search: string): void {
  try {
    const p = new URLSearchParams(search);
    const utm: Utm = {};
    for (const k of ["source", "medium", "campaign"] as const) {
      const v = p.get(`utm_${k}`);
      if (v) utm[k] = v.slice(0, 100);
    }
    if (Object.keys(utm).length) sessionStorage.setItem(KEY, JSON.stringify(utm));
  } catch {
    // Storage blocked (private mode): tracking is optional.
  }
}

export function readUtm(): Utm | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Utm) : undefined;
  } catch {
    return undefined;
  }
}
