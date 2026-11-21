import { describe, expect, it } from "vitest";
import { isSpecular, ita, itaCategory, labToSrgb, srgbToLab } from "./convert";

describe("srgbToLab", () => {
  it("maps white to L 100, a 0, b 0", () => {
    const [L, a, b] = srgbToLab(255, 255, 255);
    expect(L).toBeCloseTo(100, 0);
    expect(Math.abs(a)).toBeLessThan(0.5);
    expect(Math.abs(b)).toBeLessThan(0.5);
  });

  it("maps pure red to the reference Lab values", () => {
    const [L, a, b] = srgbToLab(255, 0, 0);
    expect(L).toBeCloseTo(53.24, 1);
    expect(a).toBeCloseTo(80.09, 1);
    expect(b).toBeCloseTo(67.2, 1);
  });

  it("maps mid grey to L about 50", () => {
    const [L] = srgbToLab(119, 119, 119);
    expect(Math.abs(L - 50)).toBeLessThan(0.5);
  });

  it("round-trips a skin colour within 1 per channel", () => {
    const [L, a, b] = srgbToLab(200, 150, 120);
    const [r, g, bl] = labToSrgb(L, a, b);
    expect(Math.abs(r - 200)).toBeLessThanOrEqual(1);
    expect(Math.abs(g - 150)).toBeLessThanOrEqual(1);
    expect(Math.abs(bl - 120)).toBeLessThanOrEqual(1);
  });
});

describe("ita", () => {
  it("computes the individual typology angle in degrees", () => {
    expect(ita(70, 15)).toBeCloseTo(53.13, 1);
  });

  it("buckets angles into the standard categories", () => {
    expect(itaCategory(56)).toBe("very-light");
    expect(itaCategory(50)).toBe("light");
    expect(itaCategory(30)).toBe("intermediate");
    expect(itaCategory(20)).toBe("tan");
    expect(itaCategory(-10)).toBe("brown");
    expect(itaCategory(-40)).toBe("dark");
  });
});

describe("isSpecular", () => {
  it("flags bright, colourless highlights only", () => {
    expect(isSpecular(250, 248, 245)).toBe(true);
    expect(isSpecular(200, 150, 120)).toBe(false);
  });
});
