import { describe, expect, it } from "vitest";
import { ApiError } from "../src/errors.js";
import { createYouCamProvider, youcamHealthScore, type YouCamOptions } from "../src/providers/youcam.js";
import { CONCERN_IDS, type ConcernId } from "../src/types.js";
import {
  API_KEY,
  BASE,
  S3_URL,
  SAMPLE_CONCERNS,
  failed,
  fakeYouCam,
  running,
  sampleOutput,
  success,
  type FakeOptions,
} from "./fakeYoucam.js";
import { fakeClock, fakeJpeg, fakePng } from "./helpers.js";

const CONCERNS: ConcernId[] = ["acne", "wrinkles", "pores", "texture"];

function setup(fakeOpts: FakeOptions = {}, extra: Partial<YouCamOptions> = {}) {
  const fake = fakeYouCam(fakeOpts);
  const clock = fakeClock();
  const provider = createYouCamProvider({
    apiKey: API_KEY,
    baseUrl: BASE,
    fetch: fake.fetch,
    sleep: clock.sleep,
    now: clock.now,
    ...extra,
  });
  const analyze = (concerns: readonly ConcernId[] = CONCERNS, image = fakeJpeg(2048)) =>
    provider.analyze({ image, contentType: "image/jpeg", concerns });
  return { fake, clock, provider, analyze };
}

async function errorOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ApiError) return err;
    throw err;
  }
  throw new Error("expected the call to fail");
}

describe("youcam provider: happy path", () => {
  it("uploads, starts the task, polls until success and normalizes the result", async () => {
    const { fake, clock, provider } = setup({
      polls: [running(), running(), success(sampleOutput())],
    });
    const image = fakeJpeg(2048);

    const result = await provider.analyze({ image, contentType: "image/jpeg", concerns: CONCERNS });

    // Step 1: upload slot
    const [slot] = fake.ofStep("file");
    expect(slot).toMatchObject({
      method: "POST",
      url: `${BASE}/s2s/v2.0/file`,
      body: { files: [{ content_type: "image/jpeg", file_name: "face.jpg", file_size: 2048 }] },
    });
    expect(slot?.headers.authorization).toBe(`Bearer ${API_KEY}`);
    expect(slot?.headers["content-type"]).toBe("application/json");

    // Step 2: raw bytes to the presigned URL with exactly the headers YouCam gave us (no Bearer!)
    const [put] = fake.ofStep("upload");
    expect(put?.method).toBe("PUT");
    expect(put?.url).toBe(S3_URL);
    expect(put?.rawHeaders).toEqual({ "Content-Length": "2048", "Content-Type": "image/jpeg" });
    expect(put?.body).toEqual(image);

    // Step 3: task with SD actions
    const [task] = fake.ofStep("task");
    expect(task).toMatchObject({
      method: "POST",
      url: `${BASE}/s2s/v2.1/task/skin-analysis`,
      body: { src_file_id: "file-1", dst_actions: ["acne", "wrinkle", "pore", "texture"], format: "json" },
    });
    expect(task?.headers.authorization).toBe(`Bearer ${API_KEY}`);

    // Step 4: polling every 1500 ms until success
    const polls = fake.ofStep("poll");
    expect(polls).toHaveLength(3);
    for (const poll of polls) {
      expect(poll.method).toBe("GET");
      expect(poll.url).toBe(`${BASE}/s2s/v2.1/task/skin-analysis/task-1`);
      expect(poll.headers.authorization).toBe(`Bearer ${API_KEY}`);
    }
    expect(clock.slept).toEqual([1500, 1500, 1500]);
    expect(fake.calls.map((c) => c.step)).toEqual(["file", "upload", "task", "poll", "poll", "poll"]);

    expect(result).toEqual({ provider: "youcam", concerns: SAMPLE_CONCERNS, skinAge: 27, usedSides: false });
  });

  it("declares PNG uploads as image/png / face.png", async () => {
    const { fake, provider } = setup();
    await provider.analyze({ image: fakePng(100), contentType: "image/png", concerns: CONCERNS });
    expect(fake.ofStep("file")[0]?.body).toEqual({
      files: [{ content_type: "image/png", file_name: "face.png", file_size: 100 }],
    });
    expect(fake.ofStep("upload")[0]?.rawHeaders).toEqual({ "Content-Length": "100", "Content-Type": "image/png" });
  });

  it("maps every concern id to its SD action, in the requested order", async () => {
    const { fake, analyze } = setup();
    await analyze(CONCERN_IDS);
    const body = fake.ofStep("task")[0]?.body as { dst_actions: string[] };
    expect(body.dst_actions).toEqual([
      "acne",
      "wrinkle",
      "pore",
      "texture",
      "age_spot",
      "redness",
      "oiliness",
      "dark_circle_v2",
      "eye_bag",
      "moisture",
      "radiance",
      "firmness",
    ]);
    expect(body.dst_actions.some((a) => a.startsWith("hd_"))).toBe(false);
  });

  it("honours a custom poll interval", async () => {
    const { clock, analyze } = setup({ polls: [running(), success(sampleOutput())] }, { pollIntervalMs: 10 });
    await analyze();
    expect(clock.slept).toEqual([10, 10]);
  });
});

describe("youcam provider: normalization", () => {
  it("ASSUMPTION: a higher ui_score means healthier skin (score is passed through)", () => {
    expect(youcamHealthScore({ type: "acne", ui_score: 90 })).toBe(90);
    expect(youcamHealthScore({ type: "acne", ui_score: 12.4 })).toBe(12);
  });

  it("falls back to raw_score, clamps to 1..100, and returns null without any score", () => {
    expect(youcamHealthScore({ type: "acne", raw_score: 57.33 })).toBe(57);
    expect(youcamHealthScore({ type: "acne", ui_score: 0 })).toBe(1);
    expect(youcamHealthScore({ type: "acne", ui_score: 130 })).toBe(100);
    expect(youcamHealthScore({ type: "acne" })).toBeNull();
  });

  it("is defensive: ignores junk and unknown types, omits concerns with no score, averages regions", async () => {
    const output = [
      "garbage",
      null,
      { type: 5, ui_score: 50 },
      { type: "acne" }, // no score at all -> acne omitted
      { type: "redness", ui_score: 12, mask_urls: [] },
      { type: "pore", region: "nose", ui_score: 30, mask_urls: ["https://cdn.test/nose.png"] },
      { type: "pore", region: "cheek", ui_score: 50 },
      { type: "all", score: 80, skin_age: 33.6 },
      { type: "unknown_thing", ui_score: 99 },
    ];
    const { analyze } = setup({ polls: [success(output)] });

    const result = await analyze(["acne", "redness", "pores"]);

    expect(result).toEqual({
      provider: "youcam",
      usedSides: false,
      concerns: [
        { id: "redness", score: 12, severity: 88, level: "high", maskUrl: null, regions: [] },
        {
          id: "pores",
          score: 40,
          severity: 60,
          level: "moderate",
          maskUrl: null,
          regions: [
            { name: "nose", score: 30 },
            { name: "cheek", score: 50 },
          ],
        },
      ],
      skinAge: 34,
    });
  });

  it("keeps the requested order, not the provider's order", async () => {
    const output = [
      { type: "texture", ui_score: 60 },
      { type: "acne", ui_score: 70 },
    ];
    const { analyze } = setup({ polls: [success(output)] });
    const result = await analyze(["acne", "texture"]);
    expect(result.concerns.map((c) => c.id)).toEqual(["acne", "texture"]);
  });

  it("returns skinAge null when the provider gives none", async () => {
    const { analyze } = setup({ polls: [success([{ type: "acne", ui_score: 70 }])] });
    expect((await analyze(["acne"])).skinAge).toBeNull();
  });

  it("accepts dark_circle without the _v2 suffix", async () => {
    const { analyze } = setup({ polls: [success([{ type: "dark_circle", ui_score: 66 }])] });
    expect((await analyze(["darkCircles"])).concerns[0]).toMatchObject({ id: "darkCircles", score: 66 });
  });

  it("fails with provider_error when no requested concern came back", async () => {
    const { analyze } = setup({ polls: [success([{ type: "all", score: 70 }])] });
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.status).toBe(502);
  });

  it("fails with provider_error when results are missing entirely", async () => {
    const { analyze } = setup({ polls: [{ status: 200, data: { task_status: "success" } }] });
    expect((await errorOf(analyze())).code).toBe("provider_error");
  });
});

describe("youcam provider: task errors", () => {
  it.each([
    ["error_no_face", "no_face", 422],
    ["error_src_face_too_small", "face_too_small", 422],
    ["error_src_face_out_of_bound", "face_too_small", 422],
    ["error_lighting_dark", "too_dark", 422],
    ["error_pose", "pose", 422],
    ["error_below_min_image_size", "image_too_small", 422],
    ["error_inference_crashed", "provider_error", 502],
    ["toString", "provider_error", 502],
  ])("%s -> %s (%i)", async (providerCode, code, status) => {
    const { analyze } = setup({ polls: [running(), failed(providerCode)] });
    const err = await errorOf(analyze());
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
    expect(err.message.length).toBeGreaterThan(0);
    expect(err.detail).toMatchObject({ step: "poll", providerCode, providerMessage: `detail for ${providerCode}` });
  });
});

describe("youcam provider: timeouts", () => {
  it("gives up after 45 s of polling", async () => {
    const { analyze, clock, fake } = setup({ polls: [running()] });
    const err = await errorOf(analyze());
    expect(err.code).toBe("timeout");
    expect(err.status).toBe(504);
    expect(err.detail.step).toBe("poll");
    expect(clock.now()).toBeLessThanOrEqual(45_000);
    expect(clock.now()).toBeGreaterThanOrEqual(45_000 - 1500);
    expect(fake.ofStep("poll").length).toBe(30);
  });

  it("maps an aborted/timed-out fetch to timeout", async () => {
    const fetch = (async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as typeof globalThis.fetch;
    const { analyze } = setup({}, { fetch });
    expect((await errorOf(analyze())).code).toBe("timeout");
  });
});

describe("youcam provider: HTTP errors", () => {
  it("401 -> provider_error saying the API key was rejected, without exposing the key", async () => {
    const { analyze } = setup({ replies: { file: { status: 401, body: { status: 401, error: "Unauthorized" } } } });
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/api key/i);
    expect(err.detail).toMatchObject({ step: "file", providerStatus: 401 });
    expect(JSON.stringify(err.detail)).not.toContain(API_KEY);
  });

  it("400 CreditInsufficiency -> provider_error 'out of credits'", async () => {
    const { analyze } = setup({
      replies: { task: { status: 400, body: { status: 400, error_code: "CreditInsufficiency", error: "No credit" } } },
    });
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.message).toMatch(/out of credits/i);
    expect(err.detail).toMatchObject({ step: "task", providerStatus: 400, providerCode: "CreditInsufficiency" });
  });

  it("429 -> rate_limited", async () => {
    const { analyze } = setup({ replies: { file: { status: 429, body: { status: 429 } } } });
    const err = await errorOf(analyze());
    expect(err.code).toBe("rate_limited");
    expect(err.status).toBe(429);
  });

  it("other HTTP errors -> provider_error", async () => {
    const { analyze } = setup({ replies: { poll: { status: 500, body: { status: 500 } } } });
    expect((await errorOf(analyze())).code).toBe("provider_error");
  });

  it("failed S3 upload -> provider_error", async () => {
    const { analyze, fake } = setup({ replies: { upload: { status: 403, body: "denied" } } });
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.detail).toMatchObject({ step: "upload", providerStatus: 403 });
    expect(fake.ofStep("task")).toHaveLength(0);
  });

  it("unexpected response shape -> provider_error", async () => {
    const { analyze } = setup({ replies: { file: { status: 200, body: { status: 200, data: {} } } } });
    expect((await errorOf(analyze())).code).toBe("provider_error");
  });

  it("network failure -> provider_error with the socket error code, never the key", async () => {
    const fetch = (async () => {
      throw new TypeError(`fetch failed (Bearer ${API_KEY})`, { cause: Object.assign(new Error("dns"), { code: "ENOTFOUND" }) });
    }) as typeof globalThis.fetch;
    const { analyze } = setup({}, { fetch });
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.detail).toMatchObject({ step: "file", providerCode: "ENOTFOUND" });
    expect(JSON.stringify(err)).not.toContain(API_KEY);
    expect(JSON.stringify(err.detail)).not.toContain(API_KEY);
  });
});

describe("youcam provider: configuration", () => {
  it("is not configured without an API key and refuses to call out", async () => {
    const { provider, fake } = setup({}, { apiKey: undefined });
    expect(provider.configured).toBe(false);
    const err = await errorOf(
      provider.analyze({ image: fakeJpeg(), contentType: "image/jpeg", concerns: CONCERNS }),
    );
    expect(err.code).toBe("not_configured");
    expect(err.status).toBe(503);
    expect(fake.calls).toHaveLength(0);
  });

  it("is configured with a key", () => {
    const { provider } = setup();
    expect(provider.configured).toBe(true);
    expect(provider.name).toBe("youcam");
  });
});
