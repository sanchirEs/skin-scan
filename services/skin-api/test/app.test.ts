import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { ApiError } from "../src/errors.js";
import { silentLogger, type Logger } from "../src/log.js";
import { createProvider } from "../src/providers/index.js";
import type { SkinProvider } from "../src/types.js";
import { AIL_BASE, AIL_KEY, PRO_CONCERNS, ailabError, fakeAilab } from "./fakeAilab.js";
import { API_KEY, BASE, SAMPLE_CONCERNS, failed, fakeYouCam, sampleOutput, success } from "./fakeYoucam.js";
import { fakeClock, fakeJpeg, fakePng, memoryLogger } from "./helpers.js";

const ORIGINS = "http://localhost:3000,https://*-sanchires-projects.vercel.app";
const PREVIEW = "https://skin-check-git-main-sanchires-projects.vercel.app";
const YOUCAM_ENV = { SKIN_PROVIDER: "youcam", YOUCAM_API_KEY: API_KEY, YOUCAM_BASE_URL: BASE };
const AILAB_ENV = { SKIN_PROVIDER: "ailabtools", AILABTOOLS_API_KEY: AIL_KEY, AILAB_BASE_URL: AIL_BASE, SKIN_CONCERNS: "acne,wrinkles,pores,texture" };

interface Setup {
  env?: Record<string, string>;
  provider?: SkinProvider;
  fetch?: typeof fetch;
  now?: () => number;
  logger?: Logger;
}

function makeApp({ env = {}, provider, fetch, now, logger = silentLogger }: Setup = {}) {
  const config = loadConfig({ SKIN_PROVIDER: "mock", ALLOWED_ORIGINS: ORIGINS, ...env });
  const clock = fakeClock();
  const used = provider ?? createProvider(config, { fetch, sleep: clock.sleep, now: clock.now });
  return createApp({ config, provider: used, logger, now });
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
      concerns: ["acne", "wrinkles", "pores", "texture", "spots", "redness", "oiliness", "darkCircles", "eyeBags", "moisture", "radiance", "firmness"],
    });
  });

  it("shows youcam as not configured without a key", async () => {
    const res = await makeApp({ env: { SKIN_PROVIDER: "youcam" } }).request("/health");
    expect(await json(res)).toEqual({
      ok: true,
      provider: "youcam",
      configured: false,
      concerns: ["acne", "wrinkles", "pores", "texture", "spots", "redness", "oiliness", "darkCircles", "eyeBags", "moisture", "radiance", "firmness"],
    });
  });

  it("shows youcam as configured with a key, and never exposes it", async () => {
    const res = await makeApp({ env: { SKIN_PROVIDER: "youcam", YOUCAM_API_KEY: API_KEY } }).request("/health");
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ provider: "youcam", configured: true });
    expect(text).not.toContain(API_KEY);
  });

  it("reflects AILABTOOLS_API_KEY when ailabtools is selected", async () => {
    const without = await makeApp({ env: { SKIN_PROVIDER: "ailabtools", YOUCAM_API_KEY: API_KEY } }).request("/health");
    expect(await json(without)).toMatchObject({ provider: "ailabtools", configured: false });

    const res = await makeApp({ env: AILAB_ENV }).request("/health");
    const text = await res.text();
    expect(JSON.parse(text)).toMatchObject({ provider: "ailabtools", configured: true });
    expect(text).not.toContain(AIL_KEY);
  });
});

describe("POST /v1/analyze: input validation", () => {
  it("rejects a wrong content type with 400 bad_image", async () => {
    const res = await analyze(makeApp(), fakeJpeg(), { "Content-Type": "application/octet-stream" });
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "bad_image", message: expect.any(String) });
  });

  it("rejects a malformed multipart body with 400 bad_image", async () => {
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
    const app = makeApp({ env: YOUCAM_ENV, fetch: fake.fetch });
    const res = await analyze(app);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ provider: "youcam", concerns: SAMPLE_CONCERNS, skinAge: 27, usedSides: false });
  });

  it("maps a youcam task error to 422", async () => {
    const fake = fakeYouCam({ polls: [failed("error_lighting_dark")] });
    const app = makeApp({ env: YOUCAM_ENV, fetch: fake.fetch });
    const res = await analyze(app);
    expect(res.status).toBe(422);
    expect((await json(res)).error).toBe("too_dark");
  });

  it("runs the ailabtools provider end to end (fake fetch)", async () => {
    const fake = fakeAilab();
    const res = await analyze(makeApp({ env: AILAB_ENV, fetch: fake.fetch }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ provider: "ailabtools", concerns: PRO_CONCERNS, skinAge: 31, usedSides: false });
  });

  it("maps ailabtools errors to the same contract codes", async () => {
    const noFace = await analyze(makeApp({ env: AILAB_ENV, fetch: fakeAilab(ailabError(422, "ERROR_NO_FACE_IN_FILE")).fetch }));
    expect(noFace.status).toBe(422);
    expect(await json(noFace)).toEqual({ error: "no_face", message: expect.any(String) });

    const credits = await analyze(makeApp({ env: AILAB_ENV, fetch: fakeAilab(ailabError(429, "ERROR_NOT_ENOUGH_CREDITS")).fetch }));
    expect(credits.status).toBe(502);
    expect(await json(credits)).toEqual({ error: "provider_error", message: expect.stringMatching(/out of credits/) });
  });
});

describe("logging", () => {
  it("logs exactly one provider_failed line with provider, step and provider status/code, never the key", async () => {
    const log = memoryLogger();
    const fake = fakeYouCam({ replies: { file: { status: 401, body: { status: 401, error_code: "InvalidKey" } } } });
    const res = await analyze(makeApp({ env: YOUCAM_ENV, fetch: fake.fetch, logger: log.logger }));
    expect(res.status).toBe(502);

    expect(log.lines).toHaveLength(1);
    expect(JSON.parse(log.lines[0]!)).toMatchObject({
      level: "warn",
      event: "provider_failed",
      provider: "youcam",
      code: "provider_error",
      step: "file",
      providerStatus: 401,
      providerCode: "InvalidKey",
    });
    expect(log.lines[0]).not.toContain(API_KEY);
  });

  it("logs ailabtools failures the same way, including photo problems", async () => {
    const log = memoryLogger();
    const fake = fakeAilab(ailabError(422, "ERROR_POOR_FACE_LIGHTING", "face too dark"));
    const res = await analyze(makeApp({ env: AILAB_ENV, fetch: fake.fetch, logger: log.logger }), fakeJpeg(4000, 9));
    expect(res.status).toBe(422);

    expect(log.lines).toHaveLength(1);
    expect(JSON.parse(log.lines[0]!)).toMatchObject({
      event: "provider_failed",
      provider: "ailabtools",
      code: "too_dark",
      step: "analyze",
      providerStatus: 422,
      providerCode: "ERROR_POOR_FACE_LIGHTING",
      providerMessage: "face too dark",
    });
    expect(log.lines[0]).not.toContain(AIL_KEY);
    expect(log.lines[0]!.length).toBeLessThan(600); // no image bytes
  });

  it("logs a timeout with the step it happened in", async () => {
    const log = memoryLogger();
    const fake = fakeYouCam({ polls: [{ status: 200, data: { task_status: "running" } }] });
    const res = await analyze(makeApp({ env: YOUCAM_ENV, fetch: fake.fetch, logger: log.logger }));
    expect(res.status).toBe(504);
    expect(JSON.parse(log.lines[0]!)).toMatchObject({ event: "provider_failed", provider: "youcam", code: "timeout", step: "poll" });
  });

  it("logs one request_rejected line for requests rejected before the provider", async () => {
    const log = memoryLogger();
    const res = await analyze(makeApp({ logger: log.logger }), fakeJpeg(), { "Content-Type": "text/plain" });
    expect(res.status).toBe(400);
    expect(log.lines).toHaveLength(1);
    expect(JSON.parse(log.lines[0]!)).toMatchObject({ event: "request_rejected", code: "bad_image", status: 400 });
  });

  it("logs analyze_ok on success", async () => {
    const log = memoryLogger();
    await analyze(makeApp({ logger: log.logger }));
    expect(log.lines).toHaveLength(1);
    expect(JSON.parse(log.lines[0]!)).toMatchObject({ event: "analyze_ok", provider: "mock", usedSides: false });
  });

  it("logs sidesRejected but keeps it out of the response", async () => {
    const log = memoryLogger();
    const provider = stubProvider(async () => ({
      provider: "mock",
      concerns: [],
      skinAge: null,
      usedSides: false,
      sidesRejected: "ERROR_FACE_UNRECOGNIZABLE",
    }));
    const res = await analyze(makeApp({ logger: log.logger, provider }));
    expect(await json(res)).toEqual({ provider: "mock", concerns: [], skinAge: null, usedSides: false });
    expect(JSON.parse(log.lines[0]!)).toMatchObject({ event: "analyze_ok", sidesRejected: "ERROR_FACE_UNRECOGNIZABLE" });
  });
});

describe("POST /v1/analyze: multipart with side photos", () => {
  type Part = [name: string, value: Uint8Array<ArrayBuffer> | string];

  function multipart(app: App, parts: Part[], headers: Record<string, string> = {}) {
    const form = new FormData();
    for (const [name, value] of parts) {
      if (typeof value === "string") form.append(name, value);
      else form.append(name, new Blob([value], { type: "image/jpeg" }), `${name}.jpg`);
    }
    // no Content-Type: Request sets multipart/form-data with the boundary
    return app.request("/v1/analyze", { method: "POST", headers: { "X-Forwarded-For": "203.0.113.7", ...headers }, body: form });
  }

  function recordingProvider() {
    return stubProvider(async () => ({ provider: "mock", concerns: [], skinAge: null, usedSides: false }));
  }

  it("accepts the front photo alone", async () => {
    const provider = recordingProvider();
    const front = fakeJpeg(300, 3);
    const res = await multipart(makeApp({ provider }), [["image", front]]);
    expect(res.status).toBe(200);
    const input = vi.mocked(provider.analyze).mock.calls[0]?.[0];
    expect(input?.image).toEqual(front);
    expect(input?.contentType).toBe("image/jpeg");
    expect(input?.sides).toBeUndefined();
  });

  it("passes left and right photos to the provider", async () => {
    const provider = recordingProvider();
    const left = fakeJpeg(200, 4);
    const right = fakePng(250);
    const res = await multipart(makeApp({ provider }), [
      ["image", fakePng(300)],
      ["left", left],
      ["right", right],
    ]);
    expect(res.status).toBe(200);
    const input = vi.mocked(provider.analyze).mock.calls[0]?.[0];
    expect(input?.contentType).toBe("image/png"); // detected from the bytes
    expect(input?.sides).toEqual({ left, right });
  });

  it("returns the usual contract with usedSides", async () => {
    const res = await multipart(makeApp(), [["image", fakeJpeg()], ["left", fakeJpeg()]]);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ provider: "mock", usedSides: false });
    expect(body.concerns).toHaveLength(12);
  });

  it.each<[string, Part[]]>([
    ["an unknown field name", [["image", fakeJpeg()], ["photo", fakeJpeg()]]],
    ["a missing front photo", [["left", fakeJpeg()]]],
    ["a text field instead of a file", [["image", "aGVsbG8="]]],
    ["a duplicated field", [["image", fakeJpeg()], ["image", fakeJpeg()]]],
    ["a side file that is not an image", [["image", fakeJpeg()], ["right", new TextEncoder().encode("hello") as Uint8Array<ArrayBuffer>]]],
    ["an empty front file", [["image", new Uint8Array(0)]]],
  ])("rejects %s with 400 bad_image", async (_label, parts) => {
    const provider = recordingProvider();
    const res = await multipart(makeApp({ provider }), parts);
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({ error: "bad_image", message: expect.any(String) });
    expect(provider.analyze).not.toHaveBeenCalled();
  });

  it("applies MAX_IMAGE_BYTES to each file", async () => {
    const app = makeApp({ env: { MAX_IMAGE_BYTES: "1000", RATE_LIMIT_PER_MIN: "100" } });
    const ok = await multipart(app, [["image", fakeJpeg(1000)], ["left", fakeJpeg(1000)], ["right", fakeJpeg(1000)]]);
    expect(ok.status).toBe(200);

    const tooBig = await multipart(app, [["image", fakeJpeg(1000)], ["right", fakeJpeg(1001)]]);
    expect(tooBig.status).toBe(413);
    expect(await json(tooBig)).toEqual({ error: "too_large", message: expect.any(String) });
  });

  it("youcam ignores side photos (one upload, usedSides false)", async () => {
    const fake = fakeYouCam({ polls: [success(sampleOutput())] });
    const res = await multipart(makeApp({ env: YOUCAM_ENV, fetch: fake.fetch }), [
      ["image", fakeJpeg(700)],
      ["left", fakeJpeg(800)],
      ["right", fakeJpeg(900)],
    ]);
    expect(res.status).toBe(200);
    expect((await json(res)).usedSides).toBe(false);
    expect(fake.ofStep("upload")).toHaveLength(1);
    expect(fake.ofStep("file")[0]?.body).toMatchObject({ files: [{ file_size: 700 }] });
  });

  it("ailabtools (Pro) sends side photos as left_side_image / right_side_image", async () => {
    const fake = fakeAilab();
    const left = fakeJpeg(800, 4);
    const res = await multipart(makeApp({ env: AILAB_ENV, fetch: fake.fetch }), [
      ["image", fakeJpeg(700)],
      ["left", left],
    ]);
    expect(res.status).toBe(200);
    expect((await json(res)).usedSides).toBe(true);
    expect(fake.calls[0]?.fields.left_side_image).toMatchObject({ bytes: left });
    expect(fake.calls[0]?.fields.right_side_image).toBeUndefined();
  });

  it("keeps the raw-body form working", async () => {
    const res = await analyze(makeApp());
    expect(res.status).toBe(200);
    expect((await json(res)).usedSides).toBe(false);
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
    const provider = stubProvider(async () => ({ provider: "mock", concerns: [], skinAge: null, usedSides: false }));
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
