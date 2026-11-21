import { describe, expect, it } from "vitest";
import { combineSides, levelOf, sideIntensities, toReadings } from "./readings";
import type { RawMetrics, Reading } from "./types";

const raw: RawMetrics = {
  rednessMeanA: 15.1,
  rednessFraction: 0.14,
  evennessStd: 2.6,
  spotCount: 6,
  spotsPerKpx: 0.6,
  darkCircleDeltaL: 9.7,
  shineT: 0.15,
  shineCheeks: 0.03,
  toneL: 58.2,
  toneB: 15.4,
  itaDeg: 31.2,
  zonePixels: { forehead: 5200, nose: 1900, cheekL: 1800, cheekR: 1800, chin: 1300, underEyeL: 700, underEyeR: 700 },
};

const front: Reading[] = [
  { id: "redness", intensity: 15, level: "none" },
  { id: "evenness", intensity: 30, level: "mild" },
  { id: "darkCircles", intensity: 61, level: "moderate" },
  { id: "shine", intensity: 71, level: "high", label: "shiny" },
];

const byId = (rs: Reading[], id: Reading["id"]) => rs.find((r) => r.id === id)!;

describe("sideIntensities", () => {
  it("scores redness and evenness exactly like the front reading", () => {
    const { readings } = toReadings(raw);
    expect(sideIntensities(raw)).toEqual({
      redness: byId(readings, "redness").intensity,
      evenness: byId(readings, "evenness").intensity,
    });
  });

  it("ignores the measures a side photo does not read", () => {
    const side = { ...raw, darkCircleDeltaL: NaN, shineT: NaN };
    expect(sideIntensities(side)).toEqual(sideIntensities(raw));
  });
});

describe("combineSides", () => {
  it("keeps the front readings when there are no side photos", () => {
    expect(combineSides(front, [])).toEqual(front);
  });

  it("raises redness and evenness to the strongest side and recomputes the level", () => {
    const out = combineSides(front, [{ redness: 50, evenness: 72 }]);
    expect(byId(out, "redness")).toEqual({ id: "redness", intensity: 50, level: "moderate" });
    expect(byId(out, "evenness")).toEqual({ id: "evenness", intensity: 72, level: "high" });
    expect(byId(out, "redness").level).toBe(levelOf(50));
  });

  it("never lowers a front reading", () => {
    const out = combineSides(front, [{ redness: 3, evenness: 10 }]);
    expect(out).toEqual(front);
  });

  it("takes the maximum over both sides, per measure", () => {
    const out = combineSides(front, [
      { redness: 40, evenness: 20 },
      { redness: 25, evenness: 47 },
    ]);
    expect(byId(out, "redness")).toMatchObject({ intensity: 40, level: "mild" });
    expect(byId(out, "evenness")).toMatchObject({ intensity: 47, level: "moderate" });
  });

  it("leaves dark circles and shine front-only", () => {
    const out = combineSides(front, [{ redness: 90, evenness: 90 }]);
    expect(byId(out, "darkCircles")).toEqual(byId(front, "darkCircles"));
    expect(byId(out, "shine")).toEqual(byId(front, "shine"));
  });

  it("skips a side whose numbers are not real", () => {
    const out = combineSides(front, [{ redness: NaN, evenness: NaN }]);
    expect(out).toEqual(front);
  });

  it("keeps the order of the front readings", () => {
    const out = combineSides(front, [{ redness: 50, evenness: 50 }]);
    expect(out.map((r) => r.id)).toEqual(front.map((r) => r.id));
  });
});
