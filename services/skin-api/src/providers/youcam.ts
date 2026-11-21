/**
 * Perfect Corp YouCam "AI Skin Analysis" V2.1 (server-to-server).
 *
 *   1. POST /s2s/v2.0/file                      -> file_id + presigned upload request
 *   2. PUT  <presigned url>                     raw bytes, exactly the headers YouCam gave us
 *   3. POST /s2s/v2.1/task/skin-analysis        -> task_id
 *   4. GET  /s2s/v2.1/task/skin-analysis/{id}   poll until success | error
 */
import { z } from "zod";
import { ApiError, fetchFailure, type ErrorCode } from "../errors.js";
import { clampScore, makeConcern } from "../normalize.js";
import type { AnalysisResult, Concern, ConcernId, Region, SkinProvider } from "../types.js";

/** Our concern id -> YouCam SD action. SD only: YouCam rejects tasks that mix SD and HD actions. */
export const YOUCAM_ACTIONS: Record<ConcernId, string> = {
  acne: "acne",
  wrinkles: "wrinkle",
  pores: "pore",
  texture: "texture",
  spots: "age_spot",
  redness: "redness",
  oiliness: "oiliness",
  darkCircles: "dark_circle_v2",
  eyeBags: "eye_bag",
  moisture: "moisture",
  radiance: "radiance",
  firmness: "firmness",
};

/** YouCam task error -> our 422 code. Anything else becomes provider_error. */
const TASK_ERRORS = new Map<string, ErrorCode>([
  ["error_no_face", "no_face"],
  ["error_src_face_too_small", "face_too_small"],
  ["error_src_face_out_of_bound", "face_too_small"],
  ["error_lighting_dark", "too_dark"],
  ["error_pose", "pose"],
  ["error_below_min_image_size", "image_too_small"],
]);

// ---- response shapes (only the fields we use; everything else is ignored) ----

const Id = z.union([z.string(), z.number()]).transform(String);

const UploadSlot = z
  .object({
    data: z.object({
      files: z
        .array(
          z.object({
            file_id: Id,
            requests: z
              .array(
                z.object({
                  method: z.string().default("PUT"),
                  url: z.url(),
                  headers: z.record(z.string(), z.union([z.string(), z.number()]).transform(String)).default({}),
                }),
              )
              .min(1),
          }),
        )
        .min(1),
    }),
  })
  // .min(1) above guarantees both [0]s exist
  .transform(({ data }) => ({ fileId: data.files[0]!.file_id, upload: data.files[0]!.requests[0]! }));

const TaskCreated = z.object({ data: z.object({ task_id: Id }) });

const TaskStatus = z.object({
  data: z.object({
    task_status: z.string(),
    error: z.string().nullish(),
    error_message: z.string().nullish(),
    results: z.unknown().optional(),
  }),
});

const optionalNumber = z.number().optional().catch(undefined);

const OutputItem = z.object({
  type: z.string(),
  region: z.string().optional().catch(undefined),
  ui_score: optionalNumber,
  raw_score: optionalNumber,
  score: optionalNumber,
  skin_age: optionalNumber,
  mask_urls: z.array(z.string()).optional().catch(undefined),
});
export type OutputItem = z.infer<typeof OutputItem>;

const Results = z
  .object({ output: z.array(z.unknown()).catch([]), skin_age: optionalNumber })
  .catch({ output: [], skin_age: undefined });

const ErrorBody = z.object({ error_code: z.string().optional().catch(undefined) }).catch({ error_code: undefined });

// ---- normalization ----

/**
 * ASSUMPTION: YouCam's ui_score is a 1..100 *health* score where HIGHER = HEALTHIER skin
 * (acne ui_score 90 = very little acne). Not yet confirmed against a real response.
 * If the first real call shows the opposite, flip it here, e.g. `return clampScore(101 - raw)`.
 */
export function youcamHealthScore(item: OutputItem): number | null {
  const raw = item.ui_score ?? item.raw_score ?? item.score;
  return raw === undefined ? null : clampScore(raw);
}

/** "dark_circle_v2" and "dark_circle" are the same metric. */
const sameMetric = (type: string, action: string) => type.replace(/_v2$/, "") === action.replace(/_v2$/, "");

function toConcern(id: ConcernId, items: OutputItem[]): Concern | null {
  const mine = items.filter((it) => sameMetric(it.type, YOUCAM_ACTIONS[id]));
  const isWhole = (it: OutputItem) => !it.region || it.region === "whole";
  const whole = mine.find(isWhole);
  const regions: Region[] = mine.flatMap((it) => {
    const score = youcamHealthScore(it);
    return !isWhole(it) && score !== null ? [{ name: it.region!, score }] : [];
  });

  let score = whole ? youcamHealthScore(whole) : null;
  if (score === null && regions.length > 0) {
    score = regions.reduce((sum, r) => sum + r.score, 0) / regions.length;
  }
  if (score === null) return null;
  return makeConcern(id, score, whole?.mask_urls?.[0] ?? null, regions);
}

function findSkinAge(results: z.infer<typeof Results>, items: OutputItem[]): number | null {
  const candidates = [
    results.skin_age,
    ...items.map((it) => it.skin_age),
    ...items.filter((it) => it.type === "skin_age").map((it) => it.score ?? it.ui_score ?? it.raw_score),
  ];
  const age = candidates.find((v): v is number => v !== undefined && v > 0);
  return age === undefined ? null : Math.round(age);
}

function parseResults(raw: unknown, concerns: readonly ConcernId[]) {
  const results = Results.parse(raw ?? {});
  const items = results.output.flatMap((x) => {
    const item = OutputItem.safeParse(x);
    return item.success ? [item.data] : [];
  });
  return {
    concerns: concerns.map((id) => toConcern(id, items)).filter((c): c is Concern => c !== null),
    skinAge: findSkinAge(results, items),
  };
}

// ---- provider ----

export interface YouCamOptions {
  apiKey: string | undefined;
  baseUrl: string;
  fetch?: typeof fetch;
  /** Delay between status polls. Default 1500 ms. */
  pollIntervalMs?: number;
  /** Budget for the whole upload + task + polling. Default 45 s. */
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createYouCamProvider(options: YouCamOptions): SkinProvider {
  const {
    apiKey,
    baseUrl,
    fetch: fetchFn = fetch,
    pollIntervalMs = 1500,
    timeoutMs = 45_000,
    sleep = realSleep,
    now = Date.now,
  } = options;

  // Failures carry a FailureDetail (step, provider status/code); the route logs it as one line.
  function httpError(step: string, status: number, body: unknown): ApiError {
    const providerCode = ErrorBody.parse(body).error_code;
    const detail = { step, providerStatus: status, providerCode };
    if (status === 401) return new ApiError("provider_error", "The skin analysis provider rejected our API key.", detail);
    if (status === 429) {
      return new ApiError("rate_limited", "The skin analysis provider is busy. Please try again in a minute.", detail);
    }
    if (providerCode === "CreditInsufficiency") {
      return new ApiError("provider_error", "The skin analysis provider is out of credits.", detail);
    }
    return new ApiError("provider_error", undefined, detail);
  }

  return {
    name: "youcam",
    configured: Boolean(apiKey),

    // Side photos are ignored: each extra image would cost a full analysis.
    async analyze({ image, contentType, concerns }): Promise<AnalysisResult> {
      if (!apiKey) throw new ApiError("not_configured");
      const deadline = now() + timeoutMs;

      /** fetch with the remaining time budget. */
      async function send(step: string, url: string, init: RequestInit): Promise<Response> {
        try {
          return await fetchFn(url, { ...init, signal: AbortSignal.timeout(Math.max(1, deadline - now())) });
        } catch (err) {
          throw fetchFailure(err, step);
        }
      }

      /** Authenticated JSON call to the YouCam API. */
      async function api<S extends z.ZodType>(step: string, path: string, schema: S, body?: unknown): Promise<z.output<S>> {
        const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
        if (body !== undefined) headers["Content-Type"] = "application/json";
        const res = await send(step, baseUrl + path, {
          method: body === undefined ? "GET" : "POST",
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) throw httpError(step, res.status, json);
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          throw new ApiError("provider_error", undefined, {
            step,
            providerStatus: res.status,
            providerCode: "unexpected_response",
          });
        }
        return parsed.data;
      }

      // 1. Ask for an upload slot.
      const ext = contentType === "image/png" ? "png" : "jpg";
      const { fileId, upload } = await api("file", "/s2s/v2.0/file", UploadSlot, {
        files: [{ content_type: contentType, file_name: `face.${ext}`, file_size: image.byteLength }],
      });

      // 2. Upload the bytes to the presigned URL (no Bearer header: it would break the signature).
      const put = await send("upload", upload.url, { method: upload.method, headers: upload.headers, body: image });
      if (!put.ok) throw new ApiError("provider_error", undefined, { step: "upload", providerStatus: put.status });

      // 3. Start the task.
      const task = await api("task", "/s2s/v2.1/task/skin-analysis", TaskCreated, {
        src_file_id: fileId,
        dst_actions: concerns.map((id) => YOUCAM_ACTIONS[id]),
        format: "json",
      });
      const taskPath = `/s2s/v2.1/task/skin-analysis/${encodeURIComponent(task.data.task_id)}`;

      // 4. Poll until it finishes or the budget runs out.
      for (;;) {
        if (now() + pollIntervalMs > deadline) {
          throw new ApiError("timeout", undefined, { step: "poll", providerCode: "deadline" });
        }
        await sleep(pollIntervalMs);
        const { data } = await api("poll", taskPath, TaskStatus);

        if (data.task_status === "success") {
          const result = parseResults(data.results, concerns);
          if (result.concerns.length === 0) {
            throw new ApiError("provider_error", undefined, { step: "poll", providerCode: "empty_results" });
          }
          return { provider: "youcam", ...result, usedSides: false };
        }
        if (data.task_status === "error") {
          const code = (data.error && TASK_ERRORS.get(data.error)) || "provider_error";
          throw new ApiError(code, undefined, {
            step: "poll",
            providerCode: data.error ?? undefined,
            providerMessage: data.error_message?.slice(0, 200) ?? undefined,
          });
        }
        // "running" (or anything unknown): keep polling
      }
    },
  };
}
