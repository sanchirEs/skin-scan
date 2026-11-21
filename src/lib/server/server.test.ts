import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { rateLimit } = await import("./rate-limit");
const { outcomeFor } = await import("./supabase");

describe("rateLimit", () => {
  it("allows the limit, then blocks until the window resets", () => {
    const t = 1_000_000;
    for (let i = 0; i < 3; i++) expect(rateLimit("ip-a", 3, 60_000, t)).toBe(true);
    expect(rateLimit("ip-a", 3, 60_000, t + 1)).toBe(false);
    expect(rateLimit("ip-a", 3, 60_000, t + 60_000)).toBe(true);
  });
});

describe("outcomeFor", () => {
  it("treats a repeated id as a safe retry", () => {
    expect(outcomeFor(null)).toBe("inserted");
    expect(outcomeFor({ code: "23505" })).toBe("duplicate");
    expect(outcomeFor({ code: "42P01" })).toBe("error");
  });
});
