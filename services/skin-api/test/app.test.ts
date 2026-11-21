import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { ApiError } from "../src/errors.js";
import { silentLogger } from "../src/log.js";
import { createProvider } from "../src/providers/index.js";
import type { SkinProvider } from "../src/types.js";
import { API_KEY, BASE, SAMPLE_CONCERNS, failed, fakeYouCam, sampleOutput, success } from "./fakeYoucam.js";
import { fakeClock, fakeJpeg, fakePng } from "./helpers.js";

const ORIGINS = "http://localhost:3000,https://*-sanchires-projects.vercel.app";
const PREVIEW = "https://skin-check-git-main-sanchires-projects.vercel.app";

interface Setup {
  env?: Record<string, string>;
  provider?: SkinProvider;
  fetch?: typeof fetch;
  now?: () => number;
}

function makeApp({ env = {}, provider, fetch, now }: Setup = {}) {
  const config = loadConfig({ SKIN_PROVIDER: "mock", ALLOWED_ORIGINS: ORIGINS, ...env });
  const clock = fakeClock();
  const used =
    provider ??
    createProvider(config, { logger: silentLogger, fetch, sleep: clock.sleep, now: clock.now });
  return createApp({ config, provider: used, logger: silentLogger, now });
}

type App = ReturnType<typeof makeApp>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON access in assertions
const json = (res: Response): Promise<any> => res.json();

function analyze(app: App, body: Uint8Array<ArrayBuffer> | string = fakeJpeg(), headers: Record<string, string> = {}) {
  return app.request("/v1/analyze", {
    method: "POST",
    headers: { "Content-Type": "image/jpeg", "X-Forwarded-For": "203.0.113.7", ...headers },
    body,
  });
}

function stubProvider(analyzeImpl: SkinProvider["analyze"]): SkinProvider {
  return { name: "mock", configured: true, analyze: vi.fn(analyzeImpl) };
}

describe("GET /health", () => {
  it("reports provider, configuration and concerns", async () => {
    const res = await makeApp().request("/health");
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      provider: "mock",
      configured: true,
      concerns: ["acne", "wrinkles", "pores", "texture"],
    });
  });

  it("shows youcam as not configured without a key", async () => {
    const res = await makeApp({ env: { SKIN_PROVIDER: "youcam" } }).request("/health");
    expect(await json(res)).toEqual({
      ok: true,
      provider: "youcam",
      configured: false,
      concerns: ["acne", "wrinkles", "pores", "texture"],
    });
  });

  it("shows youcam as configured with a key, and never exposes it", async () => {
    const res = await makeApp({ env: { SKIN_PROVIDER: "youcam", YOUCAM_API_KEY: API_KEY } }).request("/health");
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ provider: "youcam", configured: true });
    expect(text).not.toContain(API_KEY);
  });
});

describe("POST /v1/analyze: input validation", () => {
  it("rejects a wrong content type with 400 bad_image", async () => {
    const res = await analyze(makeApp(), fakeJpeg(), { "Content-Type": "application/octet-stream" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "bad_image", message: expect.any(String) });
  });

  it("rejects multipart/form uploads with 400 bad_image", async () => {
    const res = await analyze(makeApp(), "--boundary", { "Content-Type": "multipart/form-data; boundary=x" });
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("bad_image");
  });

  it("rejects an empty body with 400 bad_image", async () => {
    const res = await analyze(makeApp(), new Uint8Array(0));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("bad_image");
  });

  it("rejects bytes that are not the declared image type with 400 bad_image", async () => {
    const res = await analyze(makeApp(), "aGVsbG8gYmFzZTY0"); // e.g. base64 text instead of raw bytes
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("bad_image");
    const pngAsJpeg = await analyze(makeApp(), fakePng());
    expect(pngAsJpeg.status).toBe(400);
  });

  it("accepts PNG", async () => {
    const res = await analyze(makeApp(), fakePng(), { "Content-Type": "image/png" });
    expect(res.status).toBe(200);
  });

  it("rejects bodies over MAX_IMAGE_BYTES with 413 too_large", async () => {
    const app = makeApp({ env: { MAX_IMAGE_BYTES: "1000" } });
    expect((await analyze(app, fakeJpeg(1000))).status).toBe(200);
    const res = await analyze(app, fakeJpeg(1001), { "X-Forwarded-For": "198.51.100.1" });
    expect(res.status).toBe(413);
    expect(await json(res)).toEqual({ error: "too_large", message: expect.any(String) });
  });

  it("rejects a declared Content-Length over the limit without reading the body", async () => {
    const app = makeApp({ env: { MAX_IMAGE_BYTES: "1000" } });
    const res = await analyze(app, fakeJpeg(10), { "Content-Length": "999999" });
    expect(res.status).toBe(413);
  });

  it("answers 503 not_configured when youcam has no API key", async () => {
    const res = await analyze(makeApp({ env: { SKIN_PROVIDER: "youcam" } }));
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ error: "not_configured", message: expect.any(String) });
  });

  it("returns 404 JSON for unknown routes", async () => {
    const res = await makeApp().request("/nope");
    expect(res.status).toBe(404);
    expect((await json(res)).error).toBe("not_found");
  });
});

describe("POST /v1/analyze: provider errors", () => {
  it("passes provider ApiErrors through as {error, message} with their status", async () => {
    const provider = stubProvider(async () => {
      throw new ApiError("no_face");
    });
    const res = await analyze(makeApp({ provider }));
    expect(res.status).toBe(422);
    expect(await json(res)).toEqual({ error: "no_face", message: expect.any(String) });
  });

  it("turns unexpected provider crashes into 502 provider_error", async () => {
    const provider = stubProvider(async () => {
      throw new TypeError("cannot read properties of undefined");
    });
    const res = await analyze(makeApp({ provider }));
    expect(res.status).toBe(502);
    expect((await json(res)).error).toBe("provider_error");
  });

  it("runs the youcam provider end to end (fake fetch)", async () => {
    const fake = fakeYouCam({ polls: [success(sampleOutput())] });
    const app = makeApp({ env: { SKIN_PROVIDER: "youcam", YOUCAM_API_KEY: API_KEY, YOUCAM_BASE_URL: BASE }, fetch: fake.fetch });
    const res = await analyze(app);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ provider: "youcam", concerns: SAMPLE_CONCERNS, skinAge: 27 });
  });

  it("maps a youcam task error to 422", async () => {
    const fake = fakeYouCam({ polls: [failed("error_lighting_dark")] });
    const app = makeApp({ env: { SKIN_PROVIDER: "youcam", YOUCAM_API_KEY: API_KEY, YOUCAM_BASE_URL: BASE }, fetch: fake.fetch });
    const res = await analyze(app);
    expect(res.status).toBe(422);
    expect((await json(res)).error).toBe("too_dark");
  });
});

describe("CORS", () => {
  function preflight(app: App, origin: string) {
    return app.request("/v1/analyze", {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
  }

  it("answers a preflight from a wildcard-matched origin", async () => {
    const res = await preflight(makeApp(), PREVIEW);
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(PREVIEW);
    expect(res.headers.get("access-control-allow-methods")).toBe("POST, GET, OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toBe("Content-Type");
    expect(res.headers.get("access-control-max-age")).toBe("600");
  });

  it("allows an exact origin", async () => {
    const res = await preflight(makeApp(), "http://localhost:3000");
    expect(res.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
  });

  it("gives no CORS headers to a disallowed origin's preflight", async () => {
    const res = await preflight(makeApp(), "https://evil.example");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(res.headers.get("access-control-allow-methods")).toBeNull();
  });

  it("rejects a POST from a disallowed origin with 403 before touching the provider", async () => {
    const provider = stubProvider(async () => ({ provider: "mock", concerns: [], skinAge: null }));
    const res = await analyze(makeApp({ provider }), fakeJpeg(), { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(await json(res)).toEqual({ error: "origin_not_allowed", message: expect.any(String) });
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it.each([
    "https://sanchires-projects.vercel.app", // wildcard must match something
    "https://a.b-sanchires-projects.vercel.app", // wildcard does not span dots
    "https://x-sanchires-projects.vercel.app.evil.com",
    "http://x-sanchires-projects.vercel.app", // scheme matters
    "http://localhost:3001",
  ])("does not allow %s", async (origin) => {
    const res = await analyze(makeApp(), fakeJpeg(), { Origin: origin });
    expect(res.status).toBe(403);
  });

  it("echoes an allowed origin on success and on errors", async () => {
    const app = makeApp();
    const ok = await analyze(app, fakeJpeg(), { Origin: PREVIEW });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("access-control-allow-origin")).toBe(PREVIEW);
    expect(ok.headers.get("vary")).toContain("Origin");

    const bad = await analyze(app, fakeJpeg(), { Origin: PREVIEW, "Content-Type": "text/plain" });
    expect(bad.status).toBe(400);
    expect(bad.headers.get("access-control-allow-origin")).toBe(PREVIEW);
  });

  it("allows requests without an Origin header (curl, server-to-server)", async () => {
    const res = await analyze(makeApp());
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("still serves /health to other origins, just without CORS headers", async () => {
    const res = await makeApp().request("/health", { headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows RATE_LIMIT_PER_MIN requests per IP per minute; the 7th gets 429", async () => {
    let t = 1_000_000;
    const app = makeApp({ now: () => t });

    for (let i = 0; i < 6; i++) {
      expect((await analyze(app)).status).toBe(200);
    }
    const limited = await analyze(app);
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited", message: expect.any(String) });
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);

    // another client is unaffected
    expect((await analyze(app, fakeJpeg(), { "X-Forwarded-For": "198.51.100.9" })).status).toBe(200);

    // only the first x-forwarded-for entry identifies the client
    expect((await analyze(app, fakeJpeg(), { "X-Forwarded-For": "203.0.113.7, 10.0.0.2" })).status).toBe(429);

    // the window slides
    t += 60_001;
    expect((await analyze(app)).status).toBe(200);
  });

  it("respects a custom limit", async () => {
    const app = makeApp({ env: { RATE_LIMIT_PER_MIN: "2" } });
    expect((await analyze(app)).status).toBe(200);
    expect((await analyze(app)).status).toBe(200);
    expect((await analyze(app)).status).toBe(429);
  });
});

describe("mock provider end to end", () => {
  it("returns the contract shape for the configured concerns, in order", async () => {
    const app = makeApp({ env: { SKIN_CONCERNS: "redness,acne,wrinkles" } });
    const res = await analyze(app, fakeJpeg(500, 7));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = await json(res);

    expect(body.provider).toBe("mock");
    expect(body.concerns.map((c: { id: string }) => c.id)).toEqual(["redness", "acne", "wrinkles"]);
    for (const c of body.concerns) {
      expect(Object.keys(c)).toEqual(["id", "score", "severity", "level", "maskUrl", "regions"]);
      expect(c.score).toBeGreaterThanOrEqual(1);
      expect(c.score).toBeLessThanOrEqual(100);
      expect(c.severity).toBe(100 - c.score);
      expect(["none", "mild", "moderate", "high"]).toContain(c.level);
      expect(c.maskUrl).toBeNull();
      expect(Array.isArray(c.regions)).toBe(true);
    }
    expect(typeof body.skinAge).toBe("number");
  });

  it("is deterministic for the same bytes and varies with different bytes", async () => {
    const app = makeApp({ env: { RATE_LIMIT_PER_MIN: "100" } });
    const a1 = await (await analyze(app, fakeJpeg(500, 7))).json();
    const a2 = await (await analyze(app, fakeJpeg(500, 7))).json();
    const b = await (await analyze(app, fakeJpeg(500, 8))).json();
    expect(a2).toEqual(a1);
    expect(b).not.toEqual(a1);
  });
});
