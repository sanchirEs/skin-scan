import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/data/products";
import { OrderRequest, ScanRequest, priceOrder } from "./schema";

const validOrder = {
  id: "8f2c1b9e-3f4a-4c1e-9a7b-2d6e5f4a3b21",
  name: "Oyun Bat",
  phone: "+976 9911 2233",
  consent: true,
  items: [
    { productId: "balance-serum", qty: 1 },
    { productId: "daily-shield-spf50", qty: 2 },
  ],
  scanScores: {
    readings: [{ id: "redness", intensity: 40, level: "mild" }],
    tone: { ita: 32.5, category: "intermediate" },
  },
  quiz: {
    feel: "t-zone",
    breakouts: "sometimes",
    stinging: "no",
    goals: ["clear"],
    age: "20-29",
    sun: "some",
  },
};

describe("priceOrder", () => {
  it("prices from the catalog, not from the client", () => {
    const res = priceOrder(validOrder.items, PRODUCTS);
    if ("error" in res) throw new Error(res.error);
    expect(res.total).toBe(24 + 2 * 22);
    expect(res.lines[1]).toMatchObject({ productId: "daily-shield-spf50", unitPrice: 22, qty: 2 });
  });

  it("rejects products we do not sell", () => {
    expect(priceOrder([{ productId: "nope", qty: 1 }], PRODUCTS)).toEqual({ error: "unknown-product" });
  });
});

describe("OrderRequest", () => {
  it("accepts a complete order", () => {
    expect(OrderRequest.safeParse(validOrder).success).toBe(true);
  });

  it("requires consent", () => {
    expect(OrderRequest.safeParse({ ...validOrder, consent: false }).success).toBe(false);
  });

  it("rejects a phone number that is too short", () => {
    expect(OrderRequest.safeParse({ ...validOrder, phone: "123" }).success).toBe(false);
  });

  it("rejects more than ten lines", () => {
    const items = Array.from({ length: 11 }, () => ({ productId: "balance-serum", qty: 1 }));
    expect(OrderRequest.safeParse({ ...validOrder, items }).success).toBe(false);
  });

  it("drops the pregnancy answer before anything is stored", () => {
    const parsed = OrderRequest.parse({ ...validOrder, quiz: { ...validOrder.quiz, pregnant: "yes" } });
    expect("pregnant" in parsed.quiz).toBe(false);
  });

  it("refuses any image data", () => {
    expect(OrderRequest.safeParse({ ...validOrder, photo: "data:image/png;base64,AAAA" }).success).toBe(false);
    expect(
      ScanRequest.safeParse({
        id: validOrder.id,
        readings: validOrder.scanScores.readings,
        tone: validOrder.scanScores.tone,
        quality: {},
        device: { os: "iOS", browser: "Safari" },
        image: "AAAA",
      }).success,
    ).toBe(false);
  });
});
