/**
 * AILabTools "Skin Analyze" (Pro or Advanced). Synchronous: one multipart POST returns everything.
 *
 * Docs: https://www.ailabtools.com/doc/ai-portrait/analysis/skin-analysis-pro/api
 *       https://www.ailabtools.com/doc/ai-portrait/analysis/skin-analysis-pro/degree-score
 *       https://www.ailabtools.com/doc/ai-portrait/analysis/skin-analysis-advanced/api
 *       https://www.ailabtools.com/doc/response-description            (public fields, error codes)
 *
 *   POST {base}/api/portrait/analysis/skin-analysis-pro        70 credits per successful call
 *   POST {base}/api/portrait/analysis/skin-analysis-advanced   30 credits per successful call
 *   header "ailabapi-api-key: <key>"
 *   multipart/form-data "image": JPG/JPEG only, 200x200 to 4096x4096 px, Pro <= 8 MB, Advanced <= 5 MB.
 *   Pro also takes "return_maps" (comma list) and "left_side_image" / "right_side_image".
 *
 * Success: HTTP 200 and "error_code": 0. Failure: non-200 plus "error_detail": {"code": "ERROR_...", "message"}.
 */
import type { AilabTier } from "../config.js";
import { ApiError, fetchFailure, type ErrorCode } from "../errors.js";
import { detectImageType } from "../image.js";
import { clampScore, makeConcern } from "../normalize.js";
import type { AnalysisResult, Concern, ConcernId, Region, SkinProvider } from "../types.js";

const PATHS: Record<AilabTier, string> = {
  pro: "/api/portrait/analysis/skin-analysis-pro",
  advanced: "/api/portrait/analysis/skin-analysis-advanced",
};

// ---- reading untrusted JSON ----

/** at(x, "a", "b") is x.a.b for own properties of plain objects, else undefined. */
function at(value: unknown, ...path: string[]): unknown {
  let v = value;
  for (const key of path) {
    if (v === null || typeof v !== "object" || !Object.hasOwn(v, key)) return undefined;
    v = (v as Record<string, unknown>)[key];
  }
  return v;
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);

// ---- errors (error_detail.code) ----

const KEY_REJECTED = "The API key was rejected by the skin analysis provider.";
const OUT_OF_CREDITS = "The skin analysis provider is out of credits.";
// Our contract has no code for blurry / covered faces, so they are provider_error with a helpful message.
const LOW_QUALITY = "The photo is blurry or the face is covered. Please retake it in good light.";
const UNRECOGNIZABLE = "The face could not be read clearly. Please retake the photo facing the camera in good light.";
const ONE_FACE = "Please make sure only one face is in the photo.";

const ERROR_CODES = new Map<string, [ErrorCode, string?]>([
  ["ERROR_NO_FACE_IN_FILE", ["no_face"]],
  ["ERROR_SMALL_FACE_SIZE", ["face_too_small"]],
  ["ERROR_FACE_SIZE_NOT_MEET_REQUIREMENTS", ["face_too_small"]],
  ["ERROR_FACE_SIZE_RATIO_NOT_MET", ["face_too_small"]],
  ["ERROR_INCOMPLETE_FACE", ["face_too_small"]],
  ["ERROR_POOR_FACE_LIGHTING", ["too_dark"]],
  ["ERROR_FACE_NOT_FACING_FORWARD", ["pose"]],
  ["ERROR_LOW_RESOLUTION", ["image_too_small"]],
  ["ERROR_HIGH_RESOLUTION", ["too_large"]],
  ["FILE_RESOLUTION_EXCEEDS_LIMITS", ["too_large"]],
  ["FILE_SIZE_EXCEEDS_LIMIT", ["too_large"]],
  ["ERROR_REQUEST_BODY_TOO_LARGE", ["too_large"]],
  ["UNSUPPORTED_FILE_TYPES", ["bad_image"]],
  ["ERROR_UNSUPPORTED_MEDIA_TYPE", ["bad_image"]],
  ["ERROR_INVALID_FILE", ["bad_image"]],
  ["ERROR_ILLEGAL_FILE", ["bad_image"]],
  ["FILE_DECODING_FAILURE", ["bad_image"]],
  ["ERROR_UNSUPPORTED_GRAYSCALE_IMAGE", ["bad_image"]],
  ["ERROR_POOR_FACE_QUALITY", ["provider_error", LOW_QUALITY]],
  ["ERROR_BLURRY_FACE", ["provider_error", LOW_QUALITY]],
  ["ERROR_QUALITY_SCORE_NOT_MEET_REQUIREMENTS", ["provider_error", LOW_QUALITY]],
  ["ERROR_OBSTRUCTED_FACE", ["provider_error", LOW_QUALITY]],
  ["ERROR_FACE_UNRECOGNIZABLE", ["provider_error", UNRECOGNIZABLE]],
  ["FILE_CONTENT_NON_COMPLIANCE", ["provider_error", UNRECOGNIZABLE]],
  ["ERROR_NO_RECOGNITION_TARGET_DETECTED", ["no_face"]],
  ["ERROR_FACE_COUNT_INVALID", ["provider_error", ONE_FACE]],
  ["ERROR_LEFT_EYE_OCCLUSION_TOO_HIGH", ["provider_error", LOW_QUALITY]],
  ["ERROR_RIGHT_EYE_OCCLUSION_TOO_HIGH", ["provider_error", LOW_QUALITY]],
  ["ERROR_LEFT_FACE_OCCLUSION_TOO_HIGH", ["provider_error", LOW_QUALITY]],
  ["ERROR_RIGHT_FACE_OCCLUSION_TOO_HIGH", ["provider_error", LOW_QUALITY]],
  ["ERROR_CHIN_OCCLUSION_TOO_HIGH", ["provider_error", LOW_QUALITY]],
  ["ERROR_NOSE_OCCLUSION_TOO_HIGH", ["provider_error", LOW_QUALITY]],
  ["ERROR_MOUTH_OCCLUSION_TOO_HIGH", ["provider_error", LOW_QUALITY]],
  ["ERROR_UNAUTHORIZED", ["provider_error", KEY_REJECTED]],
  ["ERROR_USER_NOT_EXISTS", ["provider_error", KEY_REJECTED]],
  ["ERROR_APPLICATIONS_NOT_EXISTS", ["provider_error", KEY_REJECTED]],
  // Sent with HTTP 429, like real rate limiting, so the code must win over the status.
  ["ERROR_NOT_ENOUGH_CREDITS", ["provider_error", OUT_OF_CREDITS]],
  ["ERROR_PAYMENT_REQUIRED", ["provider_error", OUT_OF_CREDITS]],
  ["ERROR_TOO_MANY_REQUESTS", ["rate_limited"]],
  ["AI_SERVICE_FLOW_RESTRICTION", ["rate_limited"]],
  ["ERROR_REQUEST_TIMEOUT", ["timeout"]],
  ["ERROR_GATEWAY_TIMEOUT", ["timeout"]],
  ["AI_SERVICE_TIMEOUT", ["timeout"]],
]);

/**
 * HTTP statuses AILabTools uses for "this photo is not usable" (422 for face problems, 400/413/415 for the file).
 * Key (401), credit (402/429) and server (5xx) failures are not about the photos, so they are never retried.
 */
const PHOTO_REJECTED = new Set([400, 413, 415, 422]);

function failure(providerStatus: number, body: unknown): ApiError {
  const providerCode = str(at(body, "error_detail", "code"));
  const providerMessage = (str(at(body, "error_detail", "message")) ?? str(at(body, "error_msg")))?.slice(0, 200);
  const detail = { step: "analyze", providerStatus, providerCode, providerMessage };
  const known = providerCode ? ERROR_CODES.get(providerCode) : undefined;
  if (known) return new ApiError(known[0], known[1], detail);
  if (providerStatus === 401) return new ApiError("provider_error", KEY_REJECTED, detail);
  if (providerStatus === 429) return new ApiError("rate_limited", undefined, detail);
  return new ApiError("provider_error", undefined, detail);
}

// ---- masks ----

/**
 * maskUrl from a "face_maps" value. The docs type them as base64 (PNG for most maps, JPEG for some),
 * so raw base64 becomes a data URL; URLs pass through. Empty, or longer than `maxBytes`, gives null.
 */
export function toMaskUrl(value: unknown, maxBytes: number): string | null {
  if (typeof value !== "string" || value === "") return null;
  const url = /^(https?:|data:)/.test(value)
    ? value
    : `data:${value.startsWith("/9j/") ? "image/jpeg" : "image/png"};base64,${value}`;
  return url.length <= maxBytes ? url : null;
}

// ---- scores ----
// Pro "score_info" scores are health scores: the Degree & Score page bands them
// none [90,100], mild [70,89], moderate [50,69], severe [30,49]. Higher = healthier, so no inversion.

/**
 * ASSUMPTION (ours, not AILabTools'): answers that are only categories (severity levels, yes/no flags) are
 * placed at the centre of those bands: 0 none -> 95, 1 mild -> 80, 2 moderate -> 60, 3 severe -> 40.
 * A bare "yes" flag counts as moderate.
 */
const DEGREE = [95, 80, 60, 40] as const;
const degreeScore = (level: number | undefined) => (level === undefined ? undefined : DEGREE[level]);
const flagScore = (flag: number | undefined) => (flag === 0 ? DEGREE[0] : flag === 1 ? DEGREE[2] : undefined);

type Body = unknown;
interface Spec {
  score: (body: Body) => number | undefined;
  regions?: (body: Body) => Region[];
  /** "return_maps" value whose image becomes the maskUrl. */
  map?: string;
}

const result = (body: Body, ...path: string[]) => at(body, "result", ...path);
const scoreInfo = (key: string) => (body: Body) => num(result(body, "score_info", key));

function regionsFrom(entries: Array<[name: string, score: number | undefined]>): Region[] {
  return entries.flatMap(([name, score]) => (score === undefined ? [] : [{ name, score: clampScore(score) }]));
}
const average = (regions: (body: Body) => Region[]) => (body: Body) => {
  const list = regions(body);
  return list.length > 0 ? list.reduce((sum, r) => sum + r.score, 0) / list.length : undefined;
};

/** eye_pouch.value 0/1; eye_pouch_severity.value 0 mild, 1 moderate, 2 severe (only when eye_pouch is 1). Both tiers. */
function eyeBagScore(body: Body): number | undefined {
  const pouch = num(result(body, "eye_pouch", "value"));
  if (pouch !== 1) return pouch === 0 ? DEGREE[0] : undefined;
  return degreeScore(1 + (num(result(body, "eye_pouch_severity", "value")) ?? 1));
}

// Pro: per-region wrinkles from "<region>_wrinkle_info"."wrinkle_severity_level" (0..3). We do not use the
// per-region "wrinkle_score" (0..100) because the docs do not say which direction it runs.
const PRO_WRINKLES: Array<[string, string]> = [
  ["forehead", "forehead_wrinkle_info"],
  ["glabella", "glabella_wrinkle_info"],
  ["leftEye", "left_eye_wrinkle_info"],
  ["rightEye", "right_eye_wrinkle_info"],
  ["leftCrowsFeet", "left_crowsfeet_wrinkle_info"],
  ["rightCrowsFeet", "right_crowsfeet_wrinkle_info"],
  ["leftNasolabial", "left_nasolabial_wrinkle_info"],
  ["rightNasolabial", "right_nasolabial_wrinkle_info"],
  ["leftMouth", "left_mouth_wrinkle_info"],
  ["rightMouth", "right_mouth_wrinkle_info"],
  ["leftCheek", "left_cheek_wrinkle_info"],
  ["rightCheek", "right_cheek_wrinkle_info"],
];
const PRO_PORES: Array<[string, string]> = [
  ["forehead", "pores_forehead_score"],
  ["leftCheek", "pores_leftcheek_score"],
  ["rightCheek", "pores_rightcheek_score"],
  ["jaw", "pores_jaw_score"],
];
const PRO_EYES: Array<[string, string]> = [
  ["leftEye", "left_dark_circle_score"],
  ["rightEye", "right_dark_circle_score"],
];

const PRO: Partial<Record<ConcernId, Spec>> = {
  acne: {
    score: scoreInfo("acne_score"),
    map: "roi_outline_map",
    // Side photos: top-level "left_side_result"."left_acne_info"."score" (0..100). ASSUMPTION: same scale as
    // acne_score (higher = healthier); the docs give the range only.
    regions: (body) =>
      regionsFrom([
        ["leftSide", num(at(body, "left_side_result", "left_acne_info", "score"))],
        ["rightSide", num(at(body, "right_side_result", "right_acne_info", "score"))],
      ]),
  },
  wrinkles: {
    score: scoreInfo("wrinkle_score"),
    map: "texture_enhanced_lines",
    regions: (body) =>
      regionsFrom(PRO_WRINKLES.map(([name, key]) => [name, degreeScore(num(result(body, key, "wrinkle_severity_level")))])),
  },
  pores: {
    score: scoreInfo("pores_score"),
    map: "texture_enhanced_pores",
    regions: (body) =>
      regionsFrom(PRO_PORES.map(([name, key]) => [name, num(result(body, "score_info", "pores_type_score", key))])),
  },
  texture: { score: scoreInfo("rough_score"), map: "rough_area" },
  spots: { score: scoreInfo("melanin_score"), map: "brown_area" },
  // "sensitivity" is only computed when the "red_area" map is requested, so it is always asked for with redness.
  redness: { score: scoreInfo("sensitivity_score"), map: "red_area" },
  oiliness: { score: scoreInfo("oily_intensity_score"), map: "texture_enhanced_oily_area" },
  moisture: { score: scoreInfo("water_score"), map: "water_area" },
  darkCircles: {
    score: scoreInfo("dark_circle_score"),
    regions: (body) =>
      regionsFrom(PRO_EYES.map(([name, key]) => [name, num(result(body, "score_info", "dark_circle_type_score", key))])),
  },
  eyeBags: { score: eyeBagScore },
  // radiance, firmness: not measured by AILabTools
};

// Advanced has no score_info: yes/no flags per region ("value" 0/1) and acne boxes ("rectangle").
const flagRegions = (pairs: Array<[string, string]>) => (body: Body) =>
  regionsFrom(pairs.map(([name, key]) => [name, flagScore(num(result(body, key, "value")))]));

const advancedWrinkles = flagRegions([
  ["forehead", "forehead_wrinkle"],
  ["crowsFeet", "crows_feet"],
  ["underEye", "eye_finelines"],
  ["glabella", "glabella_wrinkle"],
  ["nasolabial", "nasolabial_fold"],
]);
const advancedPores = flagRegions([
  ["forehead", "pores_forehead"],
  ["leftCheek", "pores_left_cheek"],
  ["rightCheek", "pores_right_cheek"],
  ["jaw", "pores_jaw"],
]);

/** Pro's documented acne_score formula on Advanced's boxes: 100 - (1.7 x closed comedones + 2.4 x acne), floor 30. */
function advancedAcne(body: Body): number | undefined {
  const count = (key: string) => {
    const boxes = result(body, key, "rectangle");
    return num(result(body, key, "count")) ?? (Array.isArray(boxes) ? boxes.length : undefined);
  };
  const acne = count("acne");
  const closed = count("closed_comedones");
  if (acne === undefined && closed === undefined) return undefined;
  return Math.max(30, 100 - (24 * (acne ?? 0) + 17 * (closed ?? 0)) / 10);
}

const ADVANCED: Partial<Record<ConcernId, Spec>> = {
  acne: { score: advancedAcne },
  wrinkles: { score: average(advancedWrinkles), regions: advancedWrinkles },
  pores: { score: average(advancedPores), regions: advancedPores },
  eyeBags: { score: eyeBagScore },
  // texture, spots, redness, oiliness, darkCircles, moisture, radiance, firmness: no usable measure
};

function normalize(body: Body, concerns: readonly ConcernId[], specs: Partial<Record<ConcernId, Spec>>, maxMaskBytes: number) {
  const maps = result(body, "face_maps");
  const out: Concern[] = [];
  for (const id of concerns) {
    const spec = specs[id];
    const score = spec?.score(body);
    if (!spec || score === undefined) continue;
    const maskUrl = spec.map ? toMaskUrl(at(maps, spec.map), maxMaskBytes) : null;
    out.push(makeConcern(id, score, maskUrl, spec.regions?.(body) ?? []));
  }
  const age = num(result(body, "skin_age", "value"));
  return { concerns: out, skinAge: age !== undefined && age > 0 ? Math.round(age) : null };
}

// ---- provider ----

export interface AilabOptions {
  apiKey: string | undefined;
  baseUrl: string;
  tier: AilabTier;
  fetch?: typeof fetch;
  /** Default 45 s. */
  timeoutMs?: number;
  /** Largest maskUrl (data URL length) we return; bigger masks are dropped, the concern stays. Default 600 KB. */
  maxMaskBytes?: number;
}

export function createAilabProvider(options: AilabOptions): SkinProvider {
  const { apiKey, baseUrl, tier, fetch: fetchFn = fetch, timeoutMs = 45_000, maxMaskBytes = 600 * 1024 } = options;
  const specs = tier === "pro" ? PRO : ADVANCED;

  return {
    name: "ailabtools",
    configured: Boolean(apiKey),

    async analyze({ image, contentType, concerns, sides }): Promise<AnalysisResult> {
      if (!apiKey) throw new ApiError("not_configured");
      if (contentType !== "image/jpeg") {
        throw new ApiError("bad_image", "This analysis provider accepts JPEG photos only.", { step: "validate" });
      }

      // Pro only: "left_side_image" / "right_side_image" (JPG; the docs recommend the face turned ~45 degrees).
      const sidePhotos =
        tier === "pro"
          ? (["left", "right"] as const).flatMap((side) => {
              const bytes = sides?.[side];
              return bytes && detectImageType(bytes) === "image/jpeg" ? [{ side, bytes }] : [];
            })
          : [];

      const send = async (withSides: boolean): Promise<unknown> => {
        const form = new FormData();
        form.append("image", new Blob([image], { type: "image/jpeg" }), "face.jpg");
        // Only the maps of requested concerns (they are large base64 images).
        const maps = [...new Set(concerns.flatMap((id) => specs[id]?.map ?? []))];
        if (maps.length > 0) form.append("return_maps", maps.join(","));
        if (withSides) {
          for (const { side, bytes } of sidePhotos) {
            form.append(`${side}_side_image`, new Blob([bytes], { type: "image/jpeg" }), `${side}.jpg`);
          }
        }

        let res: Response;
        try {
          res = await fetchFn(baseUrl + PATHS[tier], {
            method: "POST",
            headers: { "ailabapi-api-key": apiKey },
            body: form, // fetch sets the multipart Content-Type with its boundary
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          throw fetchFailure(err, "analyze");
        }

        const body: unknown = await res.json().catch(() => null);
        const errorCode = num(at(body, "error_code"));
        if (!res.ok || (errorCode !== undefined && errorCode !== 0)) {
          const err = failure(res.ok ? (errorCode ?? res.status) : res.status, body);
          err.detail.sidesSent = withSides ? sidePhotos.length : 0;
          throw err;
        }
        if (result(body) === undefined) {
          throw new ApiError("provider_error", undefined, { step: "analyze", providerStatus: res.status, providerCode: "unexpected_response" });
        }
        return body;
      };

      // A side photo AILabTools cannot read fails the whole request (seen: 422 ERROR_FACE_UNRECOGNIZABLE).
      // Only successful calls are billed, so retry once with the front photo alone; side photos are a bonus.
      let body: unknown;
      let usedSides = sidePhotos.length > 0;
      let sidesRejected: string | undefined;
      try {
        body = await send(usedSides);
      } catch (err) {
        const status = err instanceof ApiError ? err.detail.providerStatus : undefined;
        if (!usedSides || status === undefined || !PHOTO_REJECTED.has(status)) throw err;
        sidesRejected = (err as ApiError).detail.providerCode ?? String(status);
        usedSides = false;
        body = await send(false);
      }

      const normalized = normalize(body, concerns, specs, maxMaskBytes);
      if (normalized.concerns.length === 0) {
        throw new ApiError("provider_error", undefined, { step: "analyze", providerStatus: 200, providerCode: "empty_results" });
      }
      return { provider: "ailabtools", ...normalized, usedSides, ...(sidesRejected ? { sidesRejected } : {}) };
    },
  };
}
