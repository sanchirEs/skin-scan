import { describe, expect, it } from "vitest";
import { clampScore, levelFor, makeConcern } from "../src/normalize.js";

describe("levelFor(severity)", () => {
  it.each([
    [0, "none"],
    [19, "none"],
    [20, "mild"],
    [44, "mild"],
    [45, "moderate"],
    [69, "moderate"],
    [70, "high"],
    [99, "high"],
  ])("%i -> %s", (severity, level) => {
    expect(levelFor(severity)).toBe(level);
  });
});

describe("clampScore", () => {
  it("rounds and keeps scores within 1..100", () => {
    expect(clampScore(72.4)).toBe(72);
    expect(clampScore(72.5)).toBe(73);
    expect(clampScore(0)).toBe(1);
    expect(clampScore(-5)).toBe(1);
    expect(clampScore(250)).toBe(100);
  });
});

describe("makeConcern", () => {
  it("derives severity = 100 - score and the level from severity", () => {
    expect(makeConcern("acne", 72, "https://cdn.test/m.png", [{ name: "forehead", score: 80 }])).toEqual({
      id: "acne",
      score: 72,
      severity: 28,
      level: "mild",
      maskUrl: "https://cdn.test/m.png",
      regions: [{ name: "forehead", score: 80 }],
    });
  });

  it("defaults maskUrl to null and regions to []", () => {
    expect(makeConcern("pores", 95)).toEqual({
      id: "pores",
      score: 95,
      severity: 5,
      level: "none",
      maskUrl: null,
      regions: [],
    });
  });

  it("clamps the score before deriving severity", () => {
    expect(makeConcern("redness", 0)).toMatchObject({ score: 1, severity: 99, level: "high" });
  });
});
