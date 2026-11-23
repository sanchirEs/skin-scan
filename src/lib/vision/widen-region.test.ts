import { describe, expect, it } from "vitest";
import { widenRegion } from "./analyze-frame";

describe("widenRegion", () => {
  const frame = { width: 1920, height: 1080 };

  it("grows the crop on every side", () => {
    expect(widenRegion({ cx: 800, cy: 300, cw: 400, ch: 500 }, frame, 0.3, 0.15)).toEqual({
      cx: 680,
      cy: 225,
      cw: 640,
      ch: 650,
    });
  });

  it("stays inside the frame", () => {
    const r = widenRegion({ cx: 50, cy: 20, cw: 1800, ch: 1000 }, frame, 0.3, 0.15);
    expect(r).toEqual({ cx: 0, cy: 0, cw: 1920, ch: 1080 });
  });
});
