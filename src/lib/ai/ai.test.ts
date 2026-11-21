import { describe, expect, it, vi } from "vitest";
import { OrderRequest } from "../order/schema";
import { deriveConcerns } from "../rules/concerns";
import type { QuizAnswers } from "../rules/types";
import { requestAiAnalysis } from "./client";
import type { AiConcern } from "./types";

const quiz: QuizAnswers = {
  feel: "normal",
  breakouts: "rarely",
  stinging: "no",
  goals: [],
  age: "20-29",
  pregnant: "no",
  sun: "some",
};

const concern = (id: AiConcern["id"], severity: number, level: AiConcern["level"]): AiConcern => ({
  id,
  score: 100 - severity,
  severity,
  level,
  maskUrl: null,
  regions: [],
});

const okBody = {
  provider: "youcam",
  concerns: [
    { id: "acne", score: 60, severity: 40, level: "mild", maskUrl: "https://cdn.example/acne.png", regions: [] },
    { id: "wrinkles", score: 90, severity: 10, level: "none", maskUrl: null, regions: [{ name: "forehead", score: 88 }] },
  ],
  skinAge: 27,
};

const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
const respond = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

describe("requestAiAnalysis", () => {
  it("says not configured when there is no service URL", async () => {
    expect(await requestAiAnalysis(jpeg, { baseUrl: "" })).toEqual({ ok: false, error: "not_configured" });
  });

  it("posts the raw image and returns the parsed result", async () => {
    const fetchImpl = respond(200, okBody);
    const res = await requestAiAnalysis(jpeg, { baseUrl: "https://skin.example", fetchImpl });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.result.concerns.map((c) => c.id)).toEqual(["acne", "wrinkles"]);
      expect(res.result.skinAge).toBe(27);
    }
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://skin.example/v1/analyze");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
  });

  it("passes the service's error code through", async () => {
    const res = await requestAiAnalysis(jpeg, { baseUrl: "https://skin.example", fetchImpl: respond(422, { error: "no_face" }) });
    expect(res).toEqual({ ok: false, error: "no_face" });
  });

  it("drops unknown concern ids instead of failing", async () => {
    const body = { ...okBody, concerns: [...okBody.concerns, { ...okBody.concerns[0], id: "sparkle" }] };
    const res = await requestAiAnalysis(jpeg, { baseUrl: "https://skin.example", fetchImpl: respond(200, body) });
    expect(res.ok && res.result.concerns.length).toBe(2);
  });

  it("reports a network failure", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await requestAiAnalysis(jpeg, { baseUrl: "https://skin.example", fetchImpl })).toEqual({ ok: false, error: "network" });
  });

  it("gives up after the timeout", async () => {
    const fetchImpl = vi.fn((_: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }));
    const res = await requestAiAnalysis(jpeg, { baseUrl: "https://skin.example", fetchImpl, timeoutMs: 20 });
    expect(res).toEqual({ ok: false, error: "timeout" });
  });
});

describe("AI results feed the routine", () => {
  it("turns camera-found acne into a breakouts concern", () => {
    const c = deriveConcerns([], quiz, [concern("acne", 55, "moderate")]);
    expect(c.find((x) => x.id === "breakouts")).toMatchObject({ level: "moderate", source: "measured", intensity: 55 });
  });

  it("combines AI acne with what the person told us", () => {
    const c = deriveConcerns([], { ...quiz, breakouts: "often" }, [concern("acne", 30, "mild")]);
    expect(c.find((x) => x.id === "breakouts")).toMatchObject({ level: "moderate", source: "both" });
  });

  it("turns wrinkles into the aging concern and pores into oiliness", () => {
    const c = deriveConcerns([], quiz, [concern("wrinkles", 50, "moderate"), concern("pores", 30, "mild")]);
    expect(c.find((x) => x.id === "aging")?.level).toBe("moderate");
    expect(c.find((x) => x.id === "oiliness")?.level).toBe("mild");
  });
});

describe("orders carry AI numbers only", () => {
  const order = {
    id: "8f2c1b9e-3f4a-4c1e-9a7b-2d6e5f4a3b21",
    name: "Oyun Bat",
    phone: "+976 9911 2233",
    consent: true,
    items: [{ productId: "balance-serum", qty: 1 }],
    scanScores: {
      readings: [],
      tone: { ita: 30, category: "intermediate" },
      ai: [{ id: "acne", severity: 40, level: "mild" }],
    },
    quiz: { feel: "normal", breakouts: "rarely", stinging: "no", goals: [], age: "20-29", sun: "some" },
  };

  it("accepts AI severities", () => {
    expect(OrderRequest.safeParse(order).success).toBe(true);
  });

  it("refuses mask URLs or other extra AI fields", () => {
    const withMask = {
      ...order,
      scanScores: { ...order.scanScores, ai: [{ id: "acne", severity: 40, level: "mild", maskUrl: "https://x" }] },
    };
    expect(OrderRequest.safeParse(withMask).success).toBe(false);
  });
});
