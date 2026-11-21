import { describe, expect, it } from "vitest";
import { countMask, ellipseMask, intersect, rasterizePolygon, scalePolygon, subtract } from "./geometry";

describe("rasterizePolygon", () => {
  it("fills a 10x10 square with about 100 pixels", () => {
    const m = rasterizePolygon(
      [
        { x: 5, y: 5 },
        { x: 15, y: 5 },
        { x: 15, y: 15 },
        { x: 5, y: 15 },
      ],
      20,
      20,
    );
    expect(Math.abs(countMask(m) - 100)).toBeLessThanOrEqual(10);
  });

  it("clips polygons that leave the frame", () => {
    const m = rasterizePolygon(
      [
        { x: -10, y: -10 },
        { x: 30, y: -10 },
        { x: 30, y: 30 },
        { x: -10, y: 30 },
      ],
      20,
      20,
    );
    expect(countMask(m)).toBe(400);
  });
});

describe("ellipseMask", () => {
  it("covers about pi * r^2 pixels", () => {
    const m = ellipseMask({ x: 10, y: 10 }, 5, 5, 20, 20);
    expect(Math.abs(countMask(m) - 78.5)).toBeLessThanOrEqual(8);
  });
});

describe("mask algebra", () => {
  it("subtracting a mask from itself leaves nothing", () => {
    const m = ellipseMask({ x: 10, y: 10 }, 5, 5, 20, 20);
    expect(countMask(subtract(m, m))).toBe(0);
  });

  it("intersecting with itself keeps every pixel", () => {
    const m = ellipseMask({ x: 10, y: 10 }, 5, 5, 20, 20);
    expect(countMask(intersect(m, m))).toBe(countMask(m));
  });
});

describe("scalePolygon", () => {
  it("keeps the centroid when shrinking", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const s = scalePolygon(pts, 0.5);
    const cx = s.reduce((t, p) => t + p.x, 0) / s.length;
    const cy = s.reduce((t, p) => t + p.y, 0) / s.length;
    expect(cx).toBeCloseTo(5);
    expect(cy).toBeCloseTo(5);
    expect(s[0]).toEqual({ x: 2.5, y: 2.5 });
  });
});
