import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("insertRow without Supabase configured", () => {
  it("refuses in production so an order is never silently lost", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { insertRow } = await import("./supabase");
    await expect(insertRow("orders", { id: "x" })).rejects.toThrow(/not configured/);
  });

  it("skips in development so the app runs locally", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const { insertRow } = await import("./supabase");
    await expect(insertRow("orders", { id: "x" })).resolves.toBe("skipped");
  });
});
