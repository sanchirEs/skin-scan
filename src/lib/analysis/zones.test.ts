import { describe, expect, it } from "vitest";
import { countMask, intersect, rasterizePolygon } from "./geometry";
import { makeFixtureLandmarks } from "./fixtures";
import { EYE_A, ZONE_IDS, buildZones, facingCheek } from "./zones";

describe("buildZones", () => {
  const lm = makeFixtureLandmarks(400);
  const zones = buildZones(lm, 400, 400);

  it("produces every zone with real coverage", () => {
    for (const id of ZONE_IDS) {
      expect(countMask(zones[id]), id).toBeGreaterThan(50);
    }
  });

  it("keeps the under-eye band off the eye itself", () => {
    const eye = rasterizePolygon(
      EYE_A.map((i) => lm[i]),
      400,
      400,
    );
    expect(countMask(intersect(zones.underEyeL, eye))).toBe(0);
  });

  it("puts the image-left cheek on the left half", () => {
    const m = zones.cheekL;
    let sumX = 0;
    let n = 0;
    for (let i = 0; i < m.data.length; i++) {
      if (m.data[i]) {
        sumX += i % m.width;
        n++;
      }
    }
    expect(sumX / n).toBeLessThan(200);
  });
});

describe("facingCheek", () => {
  const zones = buildZones(makeFixtureLandmarks(400), 400, 400);
  const keepX = (x0: number, x1: number) =>
    rasterizePolygon(
      [
        { x: x0, y: 0 },
        { x: x1, y: 0 },
        { x: x1, y: 400 },
        { x: x0, y: 400 },
      ],
      400,
      400,
    );

  it("picks the cheek that shows more, as the one facing the camera", () => {
    // Head turned: the far cheek is partly hidden behind the face edge.
    expect(facingCheek({ ...zones, cheekR: intersect(zones.cheekR, keepX(0, 250)) })).toBe("cheekL");
    expect(facingCheek({ ...zones, cheekL: intersect(zones.cheekL, keepX(150, 400)) })).toBe("cheekR");
  });
});
