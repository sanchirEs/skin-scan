// Colour-math skin measurements over face-zone masks. Everything here is
// relative to the same face where possible, because room light shifts
// absolute values far more than skin does.
import { isSpecular, ita, srgbToLab } from "../color/convert";
import { erode, type Mask, type Pt } from "./geometry";
import type { MeasureResult, Rgba } from "./types";
import { ZONE_IDS, type ZoneId } from "./zones";

const MIN_PIXELS = 40;
/** Pixels this much darker than their zone's median are hair or shadow, not skin. */
const HAIR_DROP_L = 20;

function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

export function measure(img: Rgba, zones: Record<ZoneId, Mask>): MeasureResult {
  const { width: w, height: h, data } = img;
  const n = w * h;
  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  const spec = new Uint8Array(n);
  const seen = new Uint8Array(n);

  const lab = (i: number) => {
    if (seen[i]) return;
    seen[i] = 1;
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const [l, a, bb] = srgbToLab(r, g, b);
    L[i] = l;
    A[i] = a;
    B[i] = bb;
    spec[i] = isSpecular(r, g, b) ? 1 : 0;
  };

  const zoneIdx = {} as Record<ZoneId, number[]>;
  const skinIdx = {} as Record<ZoneId, number[]>;
  for (const id of ZONE_IDS) {
    const all: number[] = [];
    const skin: number[] = [];
    const m = zones[id].data;
    for (let i = 0; i < n; i++) {
      if (!m[i]) continue;
      lab(i);
      all.push(i);
      if (!spec[i] && L[i] >= 15 && L[i] <= 97) skin.push(i);
    }
    zoneIdx[id] = all;
    // Hair, brows and deep shadow are far darker than the skin around them; drop them.
    const floor = median(skin.map((i) => L[i])) - HAIR_DROP_L;
    skinIdx[id] = skin.filter((i) => L[i] >= floor);
  }

  // Exposure checks run on every cheek pixel, before skin filtering.
  const cheekAll = [...zoneIdx.cheekL, ...zoneIdx.cheekR];
  if (cheekAll.length < MIN_PIXELS) return { ok: false, reason: "too-few-pixels" };
  const clipped = cheekAll.filter((i) => spec[i] || L[i] > 97).length / cheekAll.length;
  if (clipped > 0.25) return { ok: false, reason: "overexposed" };
  if (median(cheekAll.map((i) => L[i])) < 18) return { ok: false, reason: "underexposed" };
  for (const id of ZONE_IDS) {
    if (skinIdx[id].length < MIN_PIXELS) return { ok: false, reason: "too-few-pixels" };
  }

  const allSkin = ZONE_IDS.flatMap((id) => skinIdx[id]);
  const cheeks = [...skinIdx.cheekL, ...skinIdx.cheekR];
  const cheeksNose = [...cheeks, ...skinIdx.nose];

  // Redness: share of cheek/nose pixels clearly redder than this face's own baseline.
  const baselineA = median(allSkin.map((i) => A[i]));
  const rednessFraction = cheeksNose.filter((i) => A[i] > baselineA + 6).length / cheeksNose.length;
  const rednessMeanA = mean(cheeksNose.map((i) => A[i]));
  const rednessMap = new Uint8Array(n);
  for (const i of allSkin) {
    rednessMap[i] = Math.round(Math.min(1, Math.max(0, (A[i] - baselineA) / 12)) * 255);
  }

  // Evenness: lightness left over after removing smooth lighting gradients.
  const region = [...cheeks, ...skinIdx.forehead];
  const inRegion = new Uint8Array(n);
  for (const i of region) inRegion[i] = 1;
  const radius = Math.max(2, Math.round(w / 24));
  const blurred = maskedBoxBlur(L, inRegion, w, h, radius);
  const residual = new Float32Array(n);
  let sum = 0;
  let sum2 = 0;
  for (const i of region) {
    const r = L[i] - blurred[i];
    residual[i] = r;
    sum += r;
    sum2 += r * r;
  }
  const evMean = sum / region.length;
  const evennessStd = Math.sqrt(Math.max(0, sum2 / region.length - evMean * evMean));
  const threshold = -Math.max(2.2 * evennessStd, 2.5);
  // Spots are only searched away from zone edges, where shading and stray hairs live.
  const core = erode({ width: w, height: h, data: inRegion }, Math.max(3, Math.round(w / 60))).data;
  const spots = darkSpots(residual, core, w, h, threshold);
  const spotsPerKpx = spots.length / (region.length / 1000);

  // Dark circles: how much darker the under-eye band is than the cheeks.
  const underEye = [...skinIdx.underEyeL, ...skinIdx.underEyeR];
  const darkCircleDeltaL = median(cheeks.map((i) => L[i])) - median(underEye.map((i) => L[i]));

  // Shine: highlight share in the T-zone, against the cheeks.
  const tZone = [...zoneIdx.forehead, ...zoneIdx.nose];
  const shineT = tZone.filter((i) => spec[i]).length / tZone.length;
  const shineCheeks = cheekAll.filter((i) => spec[i]).length / cheekAll.length;

  const toneL = median(cheeks.map((i) => L[i]));
  const toneB = median(cheeks.map((i) => B[i]));

  const zonePixels = Object.fromEntries(ZONE_IDS.map((id) => [id, skinIdx[id].length])) as Record<ZoneId, number>;

  return {
    ok: true,
    raw: {
      rednessMeanA,
      rednessFraction,
      evennessStd,
      spotCount: spots.length,
      spotsPerKpx,
      darkCircleDeltaL,
      shineT,
      shineCheeks,
      toneL,
      toneB,
      itaDeg: ita(toneL, toneB),
      zonePixels,
    },
    maps: { redness: rednessMap, spots },
  };
}

/** Mean of `values` over `mask` inside a (2r+1)^2 window, via summed-area tables. */
function maskedBoxBlur(values: Float32Array, mask: Uint8Array, w: number, h: number, r: number): Float32Array {
  const W = w + 1;
  const sv = new Float64Array(W * (h + 1));
  const sm = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowV = 0;
    let rowM = 0;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) {
        rowV += values[i];
        rowM += 1;
      }
      sv[(y + 1) * W + x + 1] = sv[y * W + x + 1] + rowV;
      sm[(y + 1) * W + x + 1] = sm[y * W + x + 1] + rowM;
    }
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const v = sv[y1 * W + x1] - sv[y0 * W + x1] - sv[y1 * W + x0] + sv[y0 * W + x0];
      const m = sm[y1 * W + x1] - sm[y0 * W + x1] - sm[y1 * W + x0] + sm[y0 * W + x0];
      out[i] = m > 0 ? v / m : values[i];
    }
  }
  return out;
}

/** 4-connected blobs of residual below threshold, sized like a spot (3..120 px). */
function darkSpots(residual: Float32Array, mask: Uint8Array, w: number, h: number, threshold: number): Pt[] {
  const visited = new Uint8Array(w * h);
  const spots: Pt[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || visited[start] || residual[start] >= threshold) continue;
    let area = 0;
    let sx = 0;
    let sy = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % w;
      const y = (i - x) / w;
      sx += x;
      sy += y;
      const next = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of next) {
        if (j >= 0 && mask[j] && !visited[j] && residual[j] < threshold) {
          visited[j] = 1;
          stack.push(j);
        }
      }
    }
    if (area >= 3 && area <= 120) spots.push({ x: sx / area, y: sy / area });
  }
  return spots;
}
