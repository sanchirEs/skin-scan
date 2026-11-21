// Pixel masks built from polygons and ellipses. Pure TypeScript so the whole
// analysis pipeline runs (and is tested) without a canvas.

export type Pt = { x: number; y: number };
export type Mask = { width: number; height: number; data: Uint8Array };

export function emptyMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

/** Even-odd scanline fill, sampling at pixel centres. */
export function rasterizePolygon(pts: Pt[], width: number, height: number): Mask {
  const mask = emptyMask(width, height);
  const n = pts.length;
  if (n < 3) return mask;
  const xs: number[] = [];
  for (let y = 0; y < height; y++) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y > cy !== b.y > cy) {
        xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const x1 = Math.min(width - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = x0; x <= x1; x++) mask.data[y * width + x] = 1;
    }
  }
  return mask;
}

export function ellipseMask(c: Pt, rx: number, ry: number, width: number, height: number): Mask {
  const mask = emptyMask(width, height);
  if (rx <= 0 || ry <= 0) return mask;
  const y0 = Math.max(0, Math.floor(c.y - ry));
  const y1 = Math.min(height - 1, Math.ceil(c.y + ry));
  const x0 = Math.max(0, Math.floor(c.x - rx));
  const x1 = Math.min(width - 1, Math.ceil(c.x + rx));
  for (let y = y0; y <= y1; y++) {
    const dy = (y + 0.5 - c.y) / ry;
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - c.x) / rx;
      if (dx * dx + dy * dy <= 1) mask.data[y * width + x] = 1;
    }
  }
  return mask;
}

export function centroid(pts: Pt[]): Pt {
  let x = 0;
  let y = 0;
  for (const p of pts) {
    x += p.x;
    y += p.y;
  }
  return { x: x / pts.length, y: y / pts.length };
}

/** Scales a polygon about its vertex centroid. */
export function scalePolygon(pts: Pt[], factor: number): Pt[] {
  const c = centroid(pts);
  return pts.map((p) => ({ x: c.x + (p.x - c.x) * factor, y: c.y + (p.y - c.y) * factor }));
}

export function intersect(a: Mask, b: Mask): Mask {
  const out = emptyMask(a.width, a.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] & b.data[i];
  return out;
}

export function union(a: Mask, b: Mask): Mask {
  const out = emptyMask(a.width, a.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] | b.data[i];
  return out;
}

export function subtract(a: Mask, b: Mask): Mask {
  const out = emptyMask(a.width, a.height);
  for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] & (b.data[i] ^ 1);
  return out;
}

/** Keeps only pixels whose whole (2r+1)^2 neighbourhood is inside the mask. */
export function erode(m: Mask, r: number): Mask {
  const { width: w, height: h } = m;
  const W = w + 1;
  const sat = new Int32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += m.data[y * w + x];
      sat[(y + 1) * W + x + 1] = sat[y * W + x + 1] + row;
    }
  }
  const out = emptyMask(w, h);
  const full = (2 * r + 1) * (2 * r + 1);
  for (let y = r; y < h - r; y++) {
    for (let x = r; x < w - r; x++) {
      if (!m.data[y * w + x]) continue;
      const x0 = x - r;
      const y0 = y - r;
      const x1 = x + r + 1;
      const y1 = y + r + 1;
      const n = sat[y1 * W + x1] - sat[y0 * W + x1] - sat[y1 * W + x0] + sat[y0 * W + x0];
      if (n === full) out.data[y * w + x] = 1;
    }
  }
  return out;
}

export function countMask(m: Mask): number {
  let n = 0;
  for (let i = 0; i < m.data.length; i++) n += m.data[i];
  return n;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
