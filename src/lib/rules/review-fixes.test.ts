import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/products";
import type { AiConcern } from "../ai/types";
import { deriveConcerns } from "./concerns";
import { effectiveFlags } from "./flags";
import { buildRoutine } from "./routine";
import type { Product, QuizAnswers } from "./types";

const quiz = (patch: Partial<QuizAnswers>): QuizAnswers => ({
  feel: "normal",
  breakouts: "rarely",
  stinging: "no",
  goals: [],
  age: "30-39",
  pregnant: "no",
  sun: "some",
  ...patch,
});

const product = (id: string, slot: Product["slot"], helps: Product["helps"], extra: Partial<Product> = {}): Product => ({
  id,
  name: id,
  slot,
  price: 10,
  image: "",
  ingredients: [],
  helps,
  feel: ["normal"],
  flags: {},
  sample: true,
  ...extra,
});

describe("look-for hints respect the safety rules", () => {
  it("never tells a possibly pregnant user to look for retinoids", () => {
    const q = quiz({ pregnant: "prefer-not", age: "40-49", goals: ["firm"] });
    const catalog = PRODUCTS.filter((p) => !p.slot.includes("pm-treatment") || p.flags.retinoid);
    const r = buildRoutine(deriveConcerns(q), q, catalog);
    const hints = r.slots.flatMap((s) => s.lookFor).join(" ");
    expect(hints).not.toMatch(/retinoid/i);
  });

  it("never suggests benzoyl peroxide or retinoids to very sensitive skin", () => {
    const q = quiz({ stinging: "often", breakouts: "often", goals: ["firm"] });
    const r = buildRoutine(deriveConcerns(q), q, []);
    const hints = r.slots.flatMap((s) => s.lookFor).join(" ");
    expect(hints).not.toMatch(/benzoyl|retinoid/i);
  });
});

describe("the five-product cap", () => {
  it("never removes the sunscreen, even when it shares a product with a weak slot", () => {
    const busy: AiConcern[] = [{ id: "darkCircles", score: 40, severity: 60, level: "moderate", maskUrl: null, regions: [] }];
    const q = quiz({ breakouts: "often", goals: ["firm", "eyes"] });
    const catalog = [
      product("cleanser-am", ["am-cleanser"], ["breakouts", "aging"]),
      product("serum", ["am-serum"], ["breakouts", "aging"]),
      product("day-spf", ["am-moisturizer", "am-sunscreen"], []),
      product("cleanser-pm", ["pm-cleanser"], ["breakouts", "aging"]),
      product("treatment", ["pm-treatment"], ["breakouts", "aging"]),
      product("night", ["pm-moisturizer"], ["breakouts", "aging"]),
      product("eye", ["eye"], ["darkCircles", "aging"]),
    ];
    const r = buildRoutine(deriveConcerns(q, busy), q, catalog);
    expect(r.slots.find((s) => s.slot === "am-sunscreen")?.product?.id).toBe("day-spf");
    expect(new Set(r.slots.flatMap((s) => (s.product ? [s.product.id] : []))).size).toBeLessThanOrEqual(5);
  });
});

describe("no poor matches", () => {
  it("leaves a slot empty rather than fill it with a product that fits nothing", () => {
    const q = quiz({ feel: "dry", breakouts: "often" });
    const catalog = [product("misfit", ["am-serum"], ["darkCircles"], { feel: ["oily"] })];
    const r = buildRoutine(deriveConcerns(q), q, catalog);
    expect(r.slots.find((s) => s.slot === "am-serum")?.product).toBeNull();
  });
});

describe("ingredient flags on real INCI lists", () => {
  it("treats citric acid as a pH adjuster, not a peel", () => {
    expect(effectiveFlags({}, ["citric acid"]).ahaPct).toBeUndefined();
  });

  it("does not read fragrance-free as fragrance", () => {
    expect(effectiveFlags({}, ["fragrance-free"]).fragrance).toBeUndefined();
  });

  it("does not read the BHA preservative as salicylic acid", () => {
    expect(effectiveFlags({}, ["BHA"]).salicylicPct).toBeUndefined();
  });

  it("assumes the over-the-counter strength when none is written", () => {
    expect(effectiveFlags({}, ["salicylic acid"]).salicylicPct).toBe(2);
  });

  it("catches retinoic acid and INCI essential oils", () => {
    expect(effectiveFlags({}, ["retinoic acid"]).retinoid).toBe(true);
    expect(effectiveFlags({}, ["Melaleuca Alternifolia Leaf Oil"]).essentialOils).toBe(true);
  });
});
