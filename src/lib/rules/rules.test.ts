import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/products";
import type { AiConcern } from "../ai/types";
import { deriveConcerns } from "./concerns";
import { buildRoutine } from "./routine";
import type { Product, QuizAnswers } from "./types";

const ai = (id: AiConcern["id"], level: AiConcern["level"], severity = 50): AiConcern => ({
  id,
  score: 100 - severity,
  severity,
  level,
  maskUrl: null,
  regions: [],
});

const baseQuiz: QuizAnswers = {
  feel: "normal",
  breakouts: "rarely",
  stinging: "no",
  goals: ["firm"],
  age: "30-39",
  pregnant: "no",
  sun: "some",
};

const routineFor = (q: Partial<QuizAnswers>, found: AiConcern[] = [], catalog: Product[] = PRODUCTS) => {
  const quiz = { ...baseQuiz, ...q };
  return buildRoutine(deriveConcerns(quiz, found), quiz, catalog);
};

const productsIn = (r: ReturnType<typeof routineFor>) => r.slots.flatMap((s) => (s.product ? [s.product] : []));

describe("deriveConcerns", () => {
  it("takes breakouts from the answers alone", () => {
    const c = deriveConcerns({ ...baseQuiz, breakouts: "often" });
    expect(c.find((x) => x.id === "breakouts")).toMatchObject({ level: "moderate", source: "answers" });
  });

  it("raises a measured concern to mild when it is a goal", () => {
    const c = deriveConcerns({ ...baseQuiz, goals: ["calm"] });
    expect(c.find((x) => x.id === "redness")?.level).toBe("mild");
  });

  it("drops concerns that are not there", () => {
    const c = deriveConcerns(baseQuiz);
    expect(c.find((x) => x.id === "redness")).toBeUndefined();
  });

  it("combines shine with how the skin feels for oiliness", () => {
    const c = deriveConcerns({ ...baseQuiz, feel: "oily" });
    expect(c.find((x) => x.id === "oiliness")).toMatchObject({ level: "moderate", source: "answers" });
  });

  it("measures nothing without the AI check", () => {
    const c = deriveConcerns(baseQuiz);
    expect(c.every((x) => x.source === "answers")).toBe(true);
  });

  it("measures dryness, dullness and eye bags with the AI", () => {
    const c = deriveConcerns(baseQuiz, [ai("moisture", "moderate", 45), ai("radiance", "mild", 25), ai("eyeBags", "high", 80)]);
    expect(c.find((x) => x.id === "dryness")).toMatchObject({ level: "moderate", source: "measured", intensity: 45 });
    expect(c.find((x) => x.id === "uneven")).toMatchObject({ level: "mild", source: "measured" });
    expect(c.find((x) => x.id === "darkCircles")).toMatchObject({ level: "high", intensity: 80 });
  });

  it("does not raise a concern the AI found clear", () => {
    const c = deriveConcerns(baseQuiz, [ai("darkCircles", "none", 5), ai("redness", "none", 3)]);
    expect(c.find((x) => x.id === "darkCircles")).toBeUndefined();
    expect(c.find((x) => x.id === "redness")).toBeUndefined();
  });
});

describe("buildRoutine safety", () => {
  it("never gives a retinoid during pregnancy", () => {
    const r = routineFor({ pregnant: "yes" });
    expect(productsIn(r).some((p) => p.flags.retinoid)).toBe(false);
    expect(r.excluded).toContainEqual(
      expect.objectContaining({ product: expect.objectContaining({ id: "night-renew-retinol" }), rule: "pregnancy" }),
    );
  });

  it("treats prefer-not-to-say like pregnancy", () => {
    const r = routineFor({ pregnant: "prefer-not" });
    expect(productsIn(r).some((p) => p.flags.retinoid)).toBe(false);
  });

  it("keeps fragrance and retinoids away from very sensitive skin", () => {
    const r = routineFor({ stinging: "often" });
    const ids = productsIn(r).map((p) => p.id);
    expect(ids).not.toContain("daily-gel-moisturizer");
    expect(ids).not.toContain("night-renew-retinol");
  });

  it("gives no retinoid under 20", () => {
    const r = routineFor({ age: "<20", goals: ["firm", "clear"] });
    expect(productsIn(r).some((p) => p.flags.retinoid)).toBe(false);
  });
});

describe("buildRoutine shape", () => {
  it("always includes sunscreen", () => {
    const r = routineFor({});
    expect(r.slots.find((s) => s.slot === "am-sunscreen")?.product?.id).toBe("daily-shield-spf50");
  });

  it("never asks for more than five products", () => {
    const busy = (["redness", "spots", "darkCircles", "oiliness", "moisture"] as const).map((id) => ai(id, "moderate", 60));
    const r = routineFor({ breakouts: "often", goals: ["firm", "eyes"], age: "40-49" }, busy);
    expect(new Set(productsIn(r).map((p) => p.id)).size).toBeLessThanOrEqual(5);
  });

  it("says what to look for when the range has nothing for a slot", () => {
    const noEye = PRODUCTS.filter((p) => !p.slot.includes("eye"));
    const dark = [ai("darkCircles", "moderate", 60)];
    const r = routineFor({}, dark, noEye);
    const eye = r.slots.find((s) => s.slot === "eye");
    expect(eye?.product).toBeNull();
    expect(eye?.lookFor.length).toBeGreaterThan(0);
  });

  it("matches the look-for hint to the kind of product", () => {
    const r = routineFor({ feel: "oily" }, [], []);
    const hint = (slot: string) => r.slots.find((s) => s.slot === slot)?.lookFor.join(", ") ?? "";
    expect(hint("am-cleanser")).toMatch(/salicylic acid/);
    expect(hint("am-moisturizer")).not.toMatch(/salicylic acid/);
    expect(hint("am-moisturizer")).toMatch(/moisturizer/);
  });

  it("suggests a dermatologist for painful breakouts", () => {
    expect(routineFor({ breakouts: "painful" }).seeDermatologist).toBe(true);
    expect(routineFor({}).seeDermatologist).toBe(false);
  });

  it("explains each product with the concern it answers", () => {
    const r = routineFor({ breakouts: "often" });
    const filled = r.slots.filter((s) => s.product && s.slot !== "am-sunscreen");
    expect(filled.some((s) => s.reason === "breakouts")).toBe(true);
  });
});
