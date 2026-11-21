import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("applies the documented defaults", () => {
    expect(loadConfig({})).toEqual({
      port: 8080,
      provider: "youcam",
      youcam: { apiKey: undefined, baseUrl: "https://yce-api-01.makeupar.com" },
      ailabtools: { apiKey: undefined, baseUrl: "https://www.ailabapi.com", tier: "pro" },
      concerns: ["acne", "wrinkles", "pores", "texture"],
      allowedOrigins: [],
      rateLimitPerMin: 6,
      maxImageBytes: 5_000_000,
    });
  });

  it("parses the ailabtools variables", () => {
    const config = loadConfig({
      SKIN_PROVIDER: "ailabtools",
      AILABTOOLS_API_KEY: " ail-key ",
      AILAB_BASE_URL: "https://ailab.example/",
      AILAB_TIER: "advanced",
    });
    expect(config.provider).toBe("ailabtools");
    expect(config.ailabtools).toEqual({ apiKey: "ail-key", baseUrl: "https://ailab.example", tier: "advanced" });
  });

  it("rejects an unknown AILAB_TIER", () => {
    expect(() => loadConfig({ AILAB_TIER: "basic" })).toThrow(/AILAB_TIER/);
  });

  it("parses every variable", () => {
    const config = loadConfig({
      PORT: "3001",
      SKIN_PROVIDER: "mock",
      YOUCAM_API_KEY: "  key-with-spaces  ",
      YOUCAM_BASE_URL: "https://example.test/",
      SKIN_CONCERNS: " redness, acne ,,acne",
      ALLOWED_ORIGINS: "http://localhost:3000, https://*-team.vercel.app",
      RATE_LIMIT_PER_MIN: "10",
      MAX_IMAGE_BYTES: "2_000_000",
    });
    expect(config).toEqual({
      port: 3001,
      provider: "mock",
      youcam: { apiKey: "key-with-spaces", baseUrl: "https://example.test" },
      ailabtools: { apiKey: undefined, baseUrl: "https://www.ailabapi.com", tier: "pro" },
      concerns: ["redness", "acne"],
      allowedOrigins: ["http://localhost:3000", "https://*-team.vercel.app"],
      rateLimitPerMin: 10,
      maxImageBytes: 2_000_000,
    });
  });

  it("treats empty variables as unset", () => {
    const config = loadConfig({ PORT: "", YOUCAM_API_KEY: "   ", SKIN_CONCERNS: "" });
    expect(config.port).toBe(8080);
    expect(config.youcam.apiKey).toBeUndefined();
    expect(config.concerns).toEqual(["acne", "wrinkles", "pores", "texture"]);
  });

  it("rejects unknown providers and concern ids", () => {
    expect(() => loadConfig({ SKIN_PROVIDER: "acme" })).toThrow(/SKIN_PROVIDER/);
    expect(() => loadConfig({ SKIN_CONCERNS: "acne,freckles" })).toThrow(/SKIN_CONCERNS/);
  });

  it("rejects non-numeric limits", () => {
    expect(() => loadConfig({ RATE_LIMIT_PER_MIN: "lots" })).toThrow(/RATE_LIMIT_PER_MIN/);
  });

  it("never echoes the API key in errors", () => {
    expect(() => loadConfig({ YOUCAM_API_KEY: "super-secret", PORT: "abc" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("super-secret") }),
    );
  });
});
