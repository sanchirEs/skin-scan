import { describe, expect, it } from "vitest";
import { checkQuality, laplacianVariance, poseFromMatrix, type QualityInput } from "./quality";

const good: QualityInput = {
  faces: 1,
  bbox: { x: 0.29, y: 0.25, w: 0.42, h: 0.5 },
  poseDeg: { yaw: 0, pitch: 0, roll: 0 },
  cheekL: 60,
  cheekR: 62,
  clippedShare: 0.01,
  motion: 0.003,
};

const withChange = (patch: Partial<QualityInput>): QualityInput => ({ ...good, ...patch });

describe("checkQuality", () => {
  it("passes a well-framed, well-lit, still face", () => {
    expect(checkQuality(good)).toBe("ok");
  });

  it.each<[Partial<QualityInput>, string]>([
    [{ faces: 0 }, "no-face"],
    [{ faces: 2 }, "one-face"],
    [{ bbox: { x: 0.35, y: 0.3, w: 0.3, h: 0.4 } }, "closer"],
    [{ bbox: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } }, "farther"],
    [{ bbox: { x: 0.05, y: 0.25, w: 0.42, h: 0.5 } }, "center"],
    [{ poseDeg: { yaw: 18, pitch: 0, roll: 0 } }, "straight"],
    [{ poseDeg: { yaw: 0, pitch: 0, roll: 14 } }, "straight"],
    [{ cheekL: 18, cheekR: 19 }, "more-light"],
    [{ cheekL: 95, cheekR: 94 }, "less-light"],
    [{ cheekL: 50, cheekR: 64 }, "even-light"],
    [{ motion: 0.03 }, "hold-still"],
  ])("returns the single right hint for %o", (patch, hint) => {
    expect(checkQuality(withChange(patch))).toBe(hint);
  });

  it("treats clipped highlights as too much light", () => {
    expect(checkQuality(withChange({ clippedShare: 0.3 }))).toBe("less-light");
  });

  it("lets deep skin in good light through", () => {
    expect(checkQuality(withChange({ cheekL: 33, cheekR: 35 }))).toBe("ok");
  });

  it("reports the earliest problem first", () => {
    expect(checkQuality(withChange({ faces: 0, motion: 1 }))).toBe("no-face");
  });
});

describe("poseFromMatrix", () => {
  it("reads the identity matrix as facing straight on", () => {
    const p = poseFromMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    expect(Math.abs(p.yaw)).toBeLessThan(1e-6);
    expect(Math.abs(p.pitch)).toBeLessThan(1e-6);
    expect(Math.abs(p.roll)).toBeLessThan(1e-6);
  });

  it("reads a 20 degree turn about Y as yaw 20", () => {
    const t = (20 * Math.PI) / 180;
    const c = Math.cos(t);
    const s = Math.sin(t);
    // Column-major 4x4 of Ry(t).
    const m = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
    expect(poseFromMatrix(m).yaw).toBeCloseTo(20, 1);
  });
});

describe("laplacianVariance", () => {
  it("scores a sharp checkerboard above its blurred copy", () => {
    const w = 32;
    const h = 32;
    const sharp = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) sharp[y * w + x] = (x >> 2) % 2 === (y >> 2) % 2 ? 230 : 30;
    const soft = new Uint8Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        let s = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += sharp[(y + dy) * w + x + dx];
        soft[y * w + x] = s / 9;
      }
    }
    expect(laplacianVariance(sharp, w, h)).toBeGreaterThan(laplacianVariance(soft, w, h));
  });
});
