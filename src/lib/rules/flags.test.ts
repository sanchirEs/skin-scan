import { describe, expect, it } from "vitest";
import { formatPrice } from "@/config/brand";
import { WORST_PRODUCTS } from "@/data/products.worst";
import { deriveConcerns } from "./concerns";
import { effectiveFlags } from "./flags";
import { buildRoutine } from "./routine";
import type { QuizAnswers } from "./types";

describe("effectiveFlags", () => {
  it("catches retinoids named only in the ingredient list", () => {
    expect(effectiveFlags({}, ["retinal 0.1%", "bakuchiol"]).retinoid).toBe(true);
    expect(effectiveFlags({}, ["Retinyl Palmitate"]).retinoid).toBe(true);
    expect(effectiveFlags({}, ["adapalene 0.1%"]).retinoid).toBe(true);
  });

  it("reads acid strengths from the ingredient list", () => {
    const f = effectiveFlags({}, ["salicylic acid 2%", "glycolic acid 12%", "benzoyl peroxide 5%"]);
    expect(f.salicylicPct).toBe(2);
    expect(f.ahaPct).toBe(12);
    expect(f.bpoPct).toBe(5);
  });

  it("flags fragrance and essential oils", () => {
    expect(effectiveFlags({}, ["parfum"]).fragrance).toBe(true);
    expect(effectiveFlags({}, ["lavender oil"]).essentialOils).toBe(true);
  });

  it("never loosens a flag the catalog set by hand", () => {
    expect(effectiveFlags({ retinoid: true, ahaPct: 15 }, ["aqua"])).toMatchObject({ retinoid: true, ahaPct: 15 });
  });

  it("does not flag bakuchiol or plain ingredients", () => {
    expect(effectiveFlags({}, ["bakuchiol", "niacinamide 10%", "squalane"])).toEqual({});
  });
});

describe("buildRoutine with an unflagged retinoid", () => {
  it("keeps a retinal serum away from a possibly pregnant user", () => {
    const quiz: QuizAnswers = {
      feel: "oily",
      breakouts: "painful",
      stinging: "no",
      goals: ["calm"],
      age: "50+",
      pregnant: "prefer-not",
      sun: "a-lot",
    };
    const r = buildRoutine(deriveConcerns([], quiz), quiz, WORST_PRODUCTS);
    const ids = r.slots.flatMap((s) => (s.product ? [s.product.id] : []));
    expect(ids).not.toContain("worst-serum");
    expect(r.excluded.map((e) => e.product.id)).toContain("worst-serum");
  });
});

describe("formatPrice", () => {
  it("groups thousands and keeps cents", () => {
    expect(formatPrice(1249.5)).toBe("$1,249.50");
    expect(formatPrice(18)).toBe("$18");
    expect(formatPrice(11364.48)).toBe("$11,364.48");
  });
});
