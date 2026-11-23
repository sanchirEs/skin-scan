import { describe, expect, it } from "vitest";
import { ApiError } from "../src/errors.js";
import { createAilabProvider, toMaskUrl, type AilabOptions } from "../src/providers/ailabtools.js";
import { CONCERN_IDS, type AnalyzeInput, type ConcernId } from "../src/types.js";
import {
  AIL_BASE,
  AIL_KEY,
  JPEG_B64,
  PNG_B64,
  PRO_CONCERNS,
  advancedSample,
  ailabError,
  fakeAilab,
  proSample,
  type Reply,
} from "./fakeAilab.js";
import { fakeJpeg, fakePng } from "./helpers.js";

const CONCERNS: ConcernId[] = ["acne", "wrinkles", "pores", "texture"];

function setup(reply?: Reply | Reply[], extra: Partial<AilabOptions> = {}) {
  const fake = fakeAilab(reply);
  const provider = createAilabProvider({ apiKey: AIL_KEY, baseUrl: AIL_BASE, tier: "pro", fetch: fake.fetch, ...extra });
  const analyze = (input: Partial<AnalyzeInput> = {}) =>
    provider.analyze({ image: fakeJpeg(3000), contentType: "image/jpeg", concerns: CONCERNS, ...input });
  return { fake, provider, analyze };
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

describe("ailabtools provider: Pro request", () => {
  it("POSTs multipart to skin-analysis-pro with the ailabapi-api-key header", async () => {
    const { fake, analyze } = setup();
    const image = fakeJpeg(3000);
    await analyze({ image });

    expect(fake.calls).toHaveLength(1);
    const [call] = fake.calls;
    expect(call?.method).toBe("POST");
    expect(call?.url).toBe(`${AIL_BASE}/api/portrait/analysis/skin-analysis-pro`);
    expect(call?.headers["ailabapi-api-key"]).toBe(AIL_KEY);
    expect(call?.headers.authorization).toBeUndefined();
    expect(call?.signal).toBeInstanceOf(AbortSignal);
    expect(call?.fields.image).toEqual({ name: "face.jpg", type: "image/jpeg", bytes: image });
  });

  it("asks only for the maps of the requested concerns", async () => {
    const { fake, analyze } = setup();
    await analyze();
    expect(fake.calls[0]?.fields.return_maps).toBe("roi_outline_map,texture_enhanced_lines,texture_enhanced_pores,rough_area");
    expect(fake.calls[0]?.fields.left_side_image).toBeUndefined();
  });

  it("asks for red_area whenever redness is requested (sensitivity needs it)", async () => {
    const { fake, analyze } = setup();
    await analyze({ concerns: ["redness"] });
    expect(fake.calls[0]?.fields.return_maps).toBe("red_area");
  });

  it("sends no return_maps when no requested concern has a map", async () => {
    const { fake, analyze } = setup();
    await analyze({ concerns: ["darkCircles", "eyeBags"] });
    expect(fake.calls[0]?.fields.return_maps).toBeUndefined();
  });

  it("rejects PNG without calling the API (the API accepts JPG/JPEG only)", async () => {
    const { fake, analyze } = setup();
    const err = await errorOf(analyze({ image: fakePng(), contentType: "image/png" }));
    expect(err.code).toBe("bad_image");
    expect(err.status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("ailabtools provider: Pro normalization", () => {
  it("maps score_info (higher = healthier) to our concerns with regions, masks and skin age", async () => {
    const { analyze } = setup();
    expect(await analyze()).toEqual({ provider: "ailabtools", concerns: PRO_CONCERNS, skinAge: 31, usedSides: false });
  });

  it("maps every supported concern, in the requested order, and omits unsupported ones", async () => {
    const { fake, analyze } = setup();
    const result = await analyze({ concerns: [...CONCERN_IDS].reverse() });

    expect(result.concerns.map((c) => c.id)).toEqual([
      "moisture",
      "eyeBags",
      "darkCircles",
      "oiliness",
      "redness",
      "spots",
      "texture",
      "pores",
      "wrinkles",
      "acne",
    ]);
    const byId = Object.fromEntries(result.concerns.map((c) => [c.id, c]));
    expect(byId.moisture).toMatchObject({ score: 63, maskUrl: null, regions: [] });
    expect(byId.eyeBags).toMatchObject({ score: 80, severity: 20, level: "mild" });
    expect(byId.darkCircles).toMatchObject({
      score: 70,
      regions: [
        { name: "leftEye", score: 68 },
        { name: "rightEye", score: 72 },
      ],
    });
    expect(byId.oiliness).toMatchObject({ score: 77 });
    expect(byId.redness).toMatchObject({ score: 40, severity: 60, level: "moderate" });
    expect(byId.spots).toMatchObject({ score: 81 });
    expect(fake.calls[0]?.fields.return_maps).toBe(
      "water_area,texture_enhanced_oily_area,red_area,brown_area,rough_area,texture_enhanced_pores,texture_enhanced_lines,roi_outline_map",
    );
  });

  it("drops a mask over the size cap but keeps the concern", async () => {
    const huge = "iVBOR" + "A".repeat(700_000);
    const { analyze } = setup({ body: proSample({ face_maps: { rough_area: huge, roi_outline_map: PNG_B64 } }) });
    const result = await analyze({ concerns: ["texture", "acne"] });
    expect(result.concerns[0]).toMatchObject({ id: "texture", score: 68, maskUrl: null });
    expect(result.concerns[1]?.maskUrl).toBe(`data:image/png;base64,${PNG_B64}`);
  });

  it("honours a custom mask cap", async () => {
    const { analyze } = setup(undefined, { maxMaskBytes: 50 });
    const result = await analyze({ concerns: ["wrinkles"] });
    expect(result.concerns[0]?.maskUrl).toBeNull();
  });

  it("returns skinAge null when it is missing or 0, and drops concerns without a score", async () => {
    const body = proSample({ skin_age: { value: 0 }, score_info: { acne_score: 64 } });
    const { analyze } = setup({ body });
    const result = await analyze();
    expect(result.skinAge).toBeNull();
    expect(result.concerns.map((c) => c.id)).toEqual(["acne"]);
  });

  it("fails with provider_error when no requested concern has a score", async () => {
    const { analyze } = setup({ body: proSample({ score_info: {} }) });
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.detail).toMatchObject({ step: "analyze", providerCode: "empty_results" });
  });

  it("fails with provider_error when the success body has no result", async () => {
    const { analyze } = setup({ body: { request_id: "x", error_code: 0 } });
    expect((await errorOf(analyze())).detail.providerCode).toBe("unexpected_response");
  });
});

describe("ailabtools provider: side photos (Pro left_side_image / right_side_image)", () => {
  const withSides = proSample(
    {},
    {
      left_side_result: { left_acne_info: { score: 66, acne: { count: 2 } } },
      right_side_result: { right_acne_info: { score: 90 } },
    },
  );

  it("sends both sides and turns side acne scores into acne regions", async () => {
    const { fake, analyze } = setup({ body: withSides });
    const left = fakeJpeg(500, 4);
    const right = fakeJpeg(600, 5);
    const result = await analyze({ sides: { left, right } });

    expect(fake.calls[0]?.fields.left_side_image).toEqual({ name: "left.jpg", type: "image/jpeg", bytes: left });
    expect(fake.calls[0]?.fields.right_side_image).toEqual({ name: "right.jpg", type: "image/jpeg", bytes: right });
    expect(result.usedSides).toBe(true);
    expect(result.concerns[0]).toMatchObject({
      id: "acne",
      score: 72,
      regions: [
        { name: "leftSide", score: 66 },
        { name: "rightSide", score: 90 },
      ],
    });
  });

  it("sends a single side on its own", async () => {
    const { fake, analyze } = setup();
    const result = await analyze({ sides: { right: fakeJpeg(400) } });
    expect(Object.keys(fake.calls[0]?.fields ?? {}).sort()).toEqual(["image", "return_maps", "right_side_image"]);
    expect(result.usedSides).toBe(true);
  });

  it("skips side photos that are not JPEG", async () => {
    const { fake, analyze } = setup();
    const result = await analyze({ sides: { left: fakePng() } });
    expect(fake.calls[0]?.fields.left_side_image).toBeUndefined();
    expect(result.usedSides).toBe(false);
  });

  it("retries with the front photo alone when AILabTools cannot read a side photo", async () => {
    const { fake, analyze } = setup([ailabError(422, "ERROR_FACE_UNRECOGNIZABLE"), { body: proSample() }]);
    const result = await analyze({ sides: { left: fakeJpeg(500, 4), right: fakeJpeg(600, 5) } });

    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[0]?.fields.left_side_image).toBeDefined();
    expect(Object.keys(fake.calls[1]?.fields ?? {}).sort()).toEqual(["image", "return_maps"]);
    expect(result.usedSides).toBe(false);
    expect(result.sidesRejected).toBe("ERROR_FACE_UNRECOGNIZABLE");
    expect(result.concerns.length).toBeGreaterThan(0);
  });

  it("reports the front-only failure when the retry fails too", async () => {
    const { fake, analyze } = setup([ailabError(422, "ERROR_FACE_UNRECOGNIZABLE"), ailabError(422, "ERROR_NO_FACE_IN_FILE")]);
    const err = await errorOf(analyze({ sides: { left: fakeJpeg() } }));
    expect(fake.calls).toHaveLength(2);
    expect(err.code).toBe("no_face");
    expect(err.detail).toMatchObject({ providerCode: "ERROR_NO_FACE_IN_FILE", sidesSent: 0 });
  });

  it.each([
    [401, "ERROR_UNAUTHORIZED"],
    [429, "ERROR_NOT_ENOUGH_CREDITS"],
    [500, "SOMETHING_NEW"],
  ])("does not retry HTTP %i %s (not about the photos)", async (httpStatus, providerCode) => {
    const { fake, analyze } = setup(ailabError(httpStatus, providerCode));
    const err = await errorOf(analyze({ sides: { left: fakeJpeg() } }));
    expect(fake.calls).toHaveLength(1);
    expect(err.detail.sidesSent).toBe(1);
  });

  it("does not retry a photo error when no side photo was sent", async () => {
    const { fake, analyze } = setup(ailabError(422, "ERROR_FACE_UNRECOGNIZABLE"));
    await errorOf(analyze());
    expect(fake.calls).toHaveLength(1);
  });

  it("ignores side photos on the Advanced tier", async () => {
    const { fake, analyze } = setup({ body: advancedSample() }, { tier: "advanced" });
    const result = await analyze({ sides: { left: fakeJpeg(), right: fakeJpeg() } });
    expect(fake.calls[0]?.fields.left_side_image).toBeUndefined();
    expect(result.usedSides).toBe(false);
  });
});

describe("ailabtools provider: Advanced tier", () => {
  it("calls skin-analysis-advanced without maps and scores its categorical answers", async () => {
    const { fake, analyze } = setup({ body: advancedSample() }, { tier: "advanced" });
    const result = await analyze({ concerns: ["acne", "wrinkles", "pores", "texture", "eyeBags"] });

    expect(fake.calls[0]?.url).toBe(`${AIL_BASE}/api/portrait/analysis/skin-analysis-advanced`);
    expect(Object.keys(fake.calls[0]?.fields ?? {})).toEqual(["image"]);
    expect(result).toEqual({
      provider: "ailabtools",
      usedSides: false,
      skinAge: 28,
      concerns: [
        // 100 - 2.4 * 2 acne - 1.7 * 1 closed comedone (Pro's documented acne_score formula)
        { id: "acne", score: 94, severity: 6, level: "none", maskUrl: null, regions: [] },
        {
          id: "wrinkles",
          score: 81,
          severity: 19,
          level: "none",
          maskUrl: null,
          regions: [
            { name: "forehead", score: 60 },
            { name: "crowsFeet", score: 95 },
            { name: "underEye", score: 60 },
            { name: "glabella", score: 95 },
            { name: "nasolabial", score: 95 },
          ],
        },
        {
          id: "pores",
          score: 78,
          severity: 22,
          level: "mild",
          maskUrl: null,
          regions: [
            { name: "forehead", score: 60 },
            { name: "leftCheek", score: 95 },
            { name: "rightCheek", score: 95 },
            { name: "jaw", score: 60 },
          ],
        },
        // texture: not measured by Advanced -> omitted
        { id: "eyeBags", score: 95, severity: 5, level: "none", maskUrl: null, regions: [] },
      ],
    });
  });
});

describe("ailabtools provider: masks", () => {
  it.each([
    [PNG_B64, `data:image/png;base64,${PNG_B64}`],
    [JPEG_B64, `data:image/jpeg;base64,${JPEG_B64}`],
    ["https://cdn.test/map.png", "https://cdn.test/map.png"],
    [`data:image/png;base64,${PNG_B64}`, `data:image/png;base64,${PNG_B64}`],
    ["", null],
    [undefined, null],
    [42, null],
  ])("toMaskUrl(%j)", (input, expected) => {
    expect(toMaskUrl(input, 600 * 1024)).toBe(expected);
  });
});

describe("ailabtools provider: errors", () => {
  it.each([
    [422, "ERROR_NO_FACE_IN_FILE", "no_face", 422],
    [422, "ERROR_SMALL_FACE_SIZE", "face_too_small", 422],
    [422, "ERROR_FACE_SIZE_NOT_MEET_REQUIREMENTS", "face_too_small", 422],
    [422, "ERROR_FACE_SIZE_RATIO_NOT_MET", "face_too_small", 422],
    [422, "ERROR_INCOMPLETE_FACE", "face_too_small", 422],
    [422, "ERROR_POOR_FACE_LIGHTING", "too_dark", 422],
    [422, "ERROR_FACE_NOT_FACING_FORWARD", "pose", 422],
    [422, "ERROR_LOW_RESOLUTION", "image_too_small", 422],
    [422, "ERROR_HIGH_RESOLUTION", "too_large", 413],
    [413, "FILE_SIZE_EXCEEDS_LIMIT", "too_large", 413],
    [415, "UNSUPPORTED_FILE_TYPES", "bad_image", 400],
    [422, "FILE_DECODING_FAILURE", "bad_image", 400],
    [422, "ERROR_BLURRY_FACE", "provider_error", 502],
    [422, "ERROR_FACE_UNRECOGNIZABLE", "provider_error", 502],
    [422, "FILE_CONTENT_NON_COMPLIANCE", "provider_error", 502],
    [422, "ERROR_NO_RECOGNITION_TARGET_DETECTED", "no_face", 422],
    [422, "ERROR_CHIN_OCCLUSION_TOO_HIGH", "provider_error", 502],
    [429, "ERROR_TOO_MANY_REQUESTS", "rate_limited", 429],
    [503, "AI_SERVICE_FLOW_RESTRICTION", "rate_limited", 429],
    [429, "", "rate_limited", 429],
    [504, "AI_SERVICE_TIMEOUT", "timeout", 504],
    [500, "SOMETHING_NEW", "provider_error", 502],
    [500, "toString", "provider_error", 502],
  ])("HTTP %i %s -> %s (%i)", async (httpStatus, providerCode, code, status) => {
    const { analyze } = setup(ailabError(httpStatus, providerCode));
    const err = await errorOf(analyze());
    expect(err.code).toBe(code);
    expect(err.status).toBe(status);
    expect(err.message.length).toBeGreaterThan(0);
    expect(err.detail).toMatchObject({ step: "analyze", providerStatus: httpStatus });
    if (providerCode) expect(err.detail.providerCode).toBe(providerCode);
  });

  it("asks for a retake when the face cannot be recognized", async () => {
    const { analyze } = setup(ailabError(422, "ERROR_FACE_UNRECOGNIZABLE"));
    expect((await errorOf(analyze())).message).toMatch(/retake/i);
  });

  it("explains low-quality photos in the message", async () => {
    const { analyze } = setup(ailabError(422, "ERROR_POOR_FACE_QUALITY"));
    expect((await errorOf(analyze())).message).toMatch(/blurry|covered|quality/i);
  });

  it.each([
    [401, "ERROR_UNAUTHORIZED"],
    [401, "ERROR_APPLICATIONS_NOT_EXISTS"],
    [401, ""],
  ])("HTTP %i %s -> provider_error 'API key was rejected'", async (httpStatus, providerCode) => {
    const { analyze } = setup(ailabError(httpStatus, providerCode));
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.status).toBe(502);
    expect(err.message).toMatch(/API key was rejected/);
    expect(JSON.stringify(err.detail)).not.toContain(AIL_KEY);
  });

  it.each([
    [429, "ERROR_NOT_ENOUGH_CREDITS"],
    [402, "ERROR_PAYMENT_REQUIRED"],
  ])("HTTP %i %s -> provider_error 'out of credits' (not rate_limited)", async (httpStatus, providerCode) => {
    const { analyze } = setup(ailabError(httpStatus, providerCode));
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.message).toMatch(/out of credits/);
  });

  it("treats HTTP 200 with a non-zero error_code as a failure", async () => {
    const { analyze } = setup({ status: 200, body: ailabError(422, "ERROR_NO_FACE_IN_FILE").body });
    const err = await errorOf(analyze());
    expect(err.code).toBe("no_face");
    expect(err.detail).toMatchObject({ providerStatus: 422, providerCode: "ERROR_NO_FACE_IN_FILE" });
  });

  it("handles a non-JSON error body", async () => {
    const fetch = (async () => new Response("<html>bad gateway</html>", { status: 502 })) as typeof globalThis.fetch;
    const { analyze } = setup(undefined, { fetch });
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.detail).toMatchObject({ step: "analyze", providerStatus: 502 });
  });

  it("maps a timed-out request to timeout", async () => {
    const fetch = (async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as typeof globalThis.fetch;
    const { analyze } = setup(undefined, { fetch });
    const err = await errorOf(analyze());
    expect(err.code).toBe("timeout");
    expect(err.status).toBe(504);
  });

  it("maps a network failure to provider_error with the socket code", async () => {
    const fetch = (async () => {
      throw new TypeError("fetch failed", { cause: Object.assign(new Error("refused"), { code: "ECONNREFUSED" }) });
    }) as typeof globalThis.fetch;
    const { analyze } = setup(undefined, { fetch });
    const err = await errorOf(analyze());
    expect(err.code).toBe("provider_error");
    expect(err.detail).toMatchObject({ step: "analyze", providerCode: "ECONNREFUSED" });
  });
});

describe("ailabtools provider: configuration", () => {
  it("is not configured without a key and refuses to call out", async () => {
    const { provider, fake, analyze } = setup(undefined, { apiKey: undefined });
    expect(provider.configured).toBe(false);
    expect(provider.name).toBe("ailabtools");
    expect((await errorOf(analyze())).code).toBe("not_configured");
    expect(fake.calls).toHaveLength(0);
  });

  it("is configured with a key", () => {
    expect(setup().provider.configured).toBe(true);
  });
});
