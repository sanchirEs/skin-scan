import { describe, expect, it } from "vitest";
import { labToSrgb, srgbToLab } from "../color/convert";
import { emptyMask, type Mask } from "./geometry";
import { measure } from "./measure";
import { toReadings } from "./readings";
import { makeFixtureLandmarks } from "./fixtures";
import type { Rgba } from "./types";
import { buildZones, type ZoneId } from "./zones";

const SIZE = 400;
const zones = buildZones(makeFixtureLandmarks(SIZE), SIZE, SIZE);

function skinImage(L: number, a: number, b: number): Rgba {
  const [r, g, bl] = labToSrgb(L, a, b);
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = bl;
    data[i * 4 + 3] = 255;
  }
  return { width: SIZE, height: SIZE, data };
}

function indices(mask: Mask): number[] {
  const out: number[] = [];
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) out.push(i);
  return out;
}

/** Rewrites pixels by shifting their Lab values. */
function shiftLab(img: Rgba, idx: number[], dL: number, da: number) {
  for (const i of idx) {
    const [L, a, b] = srgbToLab(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
    const [r, g, bl] = labToSrgb(L + dL, a + da, b);
    img.data[i * 4] = r;
    img.data[i * 4 + 1] = g;
    img.data[i * 4 + 2] = bl;
  }
}

function paint(img: Rgba, idx: number[], rgb: [number, number, number]) {
  for (const i of idx) {
    img.data[i * 4] = rgb[0];
    img.data[i * 4 + 1] = rgb[1];
    img.data[i * 4 + 2] = rgb[2];
  }
}

const reading = (img: Rgba, id: string) => {
  const res = measure(img, zones);
  if (!res.ok) throw new Error(res.reason);
  return toReadings(res.raw).readings.find((r) => r.id === id)!;
};

const cheekIdx = () => [...indices(zones.cheekL), ...indices(zones.cheekR)];

function centroidOf(m: Mask) {
  const idx = indices(m);
  const cx = Math.round(idx.reduce((t, i) => t + (i % SIZE), 0) / idx.length);
  const cy = Math.round(idx.reduce((t, i) => t + Math.floor(i / SIZE), 0) / idx.length);
  return { cx, cy };
}

/** Mask pixels within `width` px of the mask's edge. */
function rimOf(m: Mask, width: number): number[] {
  return indices(m).filter((i) => {
    const x = i % SIZE;
    const y = Math.floor(i / SIZE);
    for (let d = 1; d <= width; d++) {
      if (!m.data[i - d] || !m.data[i + d] || !m.data[(y - d) * SIZE + x] || !m.data[(y + d) * SIZE + x]) return true;
    }
    return false;
  });
}

describe("measure", () => {
  it("reads a uniform face as calm and even", () => {
    const img = skinImage(68, 12, 16);
    expect(reading(img, "redness").intensity).toBeLessThan(20);
    expect(reading(img, "evenness").intensity).toBeLessThan(20);
  });

  it("detects redness when a third of the cheeks turn red", () => {
    const img = skinImage(68, 12, 16);
    const idx = cheekIdx().filter((_, k) => k % 10 < 3);
    shiftLab(img, idx, 0, 12);
    const level = reading(img, "redness").level;
    expect(["moderate", "high"]).toContain(level);
  });

  it("counts small dark spots on the cheeks", () => {
    const img = skinImage(68, 12, 16);
    const res0 = measure(img, zones);
    expect(res0.ok).toBe(true);
    const cheeks = [zones.cheekL, zones.cheekR];
    let placed = 0;
    for (const m of cheeks) {
      const { cx, cy } = centroidOf(m);
      for (const [ox, oy] of [
        [-12, -9],
        [12, -9],
        [0, 0],
        [-12, 9],
        [12, 9],
      ]) {
        const blob: number[] = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) blob.push((cy + oy + dy) * SIZE + cx + ox + dx);
        shiftLab(img, blob, -15, 0);
        placed++;
      }
    }
    expect(placed).toBe(10);
    const res = measure(img, zones);
    if (!res.ok) throw new Error(res.reason);
    expect(res.raw.spotCount).toBeGreaterThanOrEqual(8);
  });

  it("does not count shadow along the edge of a zone as spots", () => {
    const img = skinImage(68, 12, 16);
    // Light falling off at the side of the face: a patchy darker rim on each cheek,
    // broken into short pieces the way real shading and stray hairs are.
    for (const m of [zones.cheekL, zones.cheekR]) {
      const patchy = rimOf(m, 4).filter((i) => Math.floor(i / SIZE / 5) % 2 === 0);
      shiftLab(img, patchy, -12, 0);
    }
    const res = measure(img, zones);
    if (!res.ok) throw new Error(res.reason);
    expect(res.raw.spotCount).toBe(0);
  });

  it("ignores hair reaching into the forehead zone", () => {
    const img = skinImage(68, 12, 16);
    const forehead = indices(zones.forehead);
    const top = Math.min(...forehead.map((i) => Math.floor(i / SIZE)));
    // Thin, partly lit strands of fringe hanging into the top of the zone.
    const hair = forehead.filter((i) => Math.floor(i / SIZE) < top + 8 && (i % SIZE) % 4 === 0);
    paint(img, hair, [82, 64, 54]);
    const res = measure(img, zones);
    if (!res.ok) throw new Error(res.reason);
    expect(res.raw.spotCount).toBe(0);
    expect(toReadings(res.raw).readings.find((r) => r.id === "evenness")!.intensity).toBeLessThan(20);
  });

  it("reads darker under-eyes as dark circles", () => {
    const img = skinImage(68, 12, 16);
    shiftLab(img, [...indices(zones.underEyeL), ...indices(zones.underEyeR)], -9, 0);
    expect(["moderate", "high"]).toContain(reading(img, "darkCircles").level);
  });

  it("labels a forehead full of highlights as shiny", () => {
    const img = skinImage(68, 12, 16);
    const idx = indices(zones.forehead).filter((_, k) => k % 5 === 0);
    paint(img, idx, [252, 250, 248]);
    expect(reading(img, "shine").label).toBe("shiny");
  });

  it("refuses to measure when zones are empty", () => {
    const img = skinImage(68, 12, 16);
    const empty = Object.fromEntries(
      Object.keys(zones).map((k) => [k, emptyMask(SIZE, SIZE)]),
    ) as Record<ZoneId, Mask>;
    expect(measure(img, empty)).toEqual({ ok: false, reason: "too-few-pixels" });
  });

  it("refuses to measure blown-out cheeks", () => {
    const img = skinImage(68, 12, 16);
    paint(
      img,
      cheekIdx().filter((_, k) => k % 10 < 4),
      [255, 255, 255],
    );
    expect(measure(img, zones)).toEqual({ ok: false, reason: "overexposed" });
  });

  it("refuses to measure a face in the dark", () => {
    const img = skinImage(12, 4, 6);
    expect(measure(img, zones)).toEqual({ ok: false, reason: "underexposed" });
  });

  it("scores redness and dark circles alike across skin tones", () => {
    const tones: [number, number][] = [
      [70, 16],
      [55, 18],
      [38, 17],
    ];
    const red: number[] = [];
    const dark: number[] = [];
    for (const [L, b] of tones) {
      const img = skinImage(L, 12, b);
      shiftLab(
        img,
        cheekIdx().filter((_, k) => k % 10 < 3),
        0,
        12,
      );
      red.push(reading(img, "redness").intensity);
      const img2 = skinImage(L, 12, b);
      shiftLab(img2, [...indices(zones.underEyeL), ...indices(zones.underEyeR)], -7, 0);
      dark.push(reading(img2, "darkCircles").intensity);
    }
    expect(Math.max(...red) - Math.min(...red)).toBeLessThan(10);
    expect(Math.max(...dark) - Math.min(...dark)).toBeLessThan(10);
  });
});

describe("toReadings", () => {
  it("reports skin tone as a category, never a score", () => {
    const img = skinImage(70, 12, 16);
    const res = measure(img, zones);
    if (!res.ok) throw new Error(res.reason);
    const out = toReadings(res.raw);
    expect(out.tone.category).toBe("light");
    expect(out.readings.map((r) => r.id)).not.toContain("tone");
  });
});
