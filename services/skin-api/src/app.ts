import { Hono } from "hono";
import type { Config } from "./config.js";
import { originMatcher } from "./cors.js";
import { ApiError } from "./errors.js";
import { detectImageType } from "./image.js";
import { consoleLogger, type Logger } from "./log.js";
import { createRateLimiter } from "./rateLimit.js";
import type { AnalyzeInput, SkinProvider } from "./types.js";

export interface AppOptions {
  config: Config;
  provider: SkinProvider;
  logger?: Logger;
  now?: () => number;
}

type Photos = Pick<AnalyzeInput, "image" | "contentType" | "sides">;

const MULTIPART_FIELDS = new Set(["image", "left", "right"]);
/** Room for multipart boundaries and part headers on top of three photos. */
const MULTIPART_OVERHEAD = 64 * 1024;

/** Read the body into memory, stopping as soon as it exceeds `max` bytes. */
async function readBody(req: Request, max: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(req.headers.get("content-length")) > max) throw new ApiError("too_large");
  if (!req.body) return new Uint8Array(0);
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new ApiError("too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Raw body: Content-Type image/jpeg or image/png, and the bytes must really be that. */
async function readRawPhoto(req: Request, mediaType: string | undefined, max: number): Promise<Photos> {
  const contentType = mediaType === "image/jpeg" || mediaType === "image/png" ? mediaType : null;
  if (!contentType) {
    throw new ApiError("bad_image", "Content-Type must be image/jpeg, image/png or multipart/form-data.");
  }
  const image = await readBody(req, max);
  if (image.byteLength === 0) throw new ApiError("bad_image", "The request body is empty.");
  if (detectImageType(image) !== contentType) {
    throw new ApiError("bad_image", `The body is not a ${contentType === "image/png" ? "PNG" : "JPEG"} image.`);
  }
  return { image, contentType };
}

/** multipart/form-data: file "image" (front, required) plus optional "left" / "right"; each JPEG or PNG, <= max bytes. */
async function readMultipartPhotos(req: Request, max: number): Promise<Photos> {
  const raw = await readBody(req, 3 * max + MULTIPART_OVERHEAD);
  let form: FormData;
  try {
    form = await new Response(raw, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    throw new ApiError("bad_image", "The multipart body could not be read.");
  }

  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const [name, value] of form) {
    if (!MULTIPART_FIELDS.has(name) || files.has(name) || typeof value === "string") {
      throw new ApiError("bad_image", 'Send an "image" photo file, plus optional "left" and "right" photo files, nothing else.');
    }
    if (value.size > max) throw new ApiError("too_large", `The "${name}" photo is too large.`);
    const bytes = new Uint8Array(await value.arrayBuffer());
    if (!detectImageType(bytes)) throw new ApiError("bad_image", `The "${name}" file is not a JPEG or PNG image.`);
    files.set(name, bytes);
  }

  const image = files.get("image");
  if (!image) throw new ApiError("bad_image", 'The "image" photo is missing.');
  const left = files.get("left");
  const right = files.get("right");
  return { image, contentType: detectImageType(image)!, sides: left || right ? { left, right } : undefined };
}

export function createApp({ config, provider, logger = consoleLogger, now = Date.now }: AppOptions) {
  const app = new Hono();
  const isAllowedOrigin = originMatcher(config.allowedOrigins);
  const limiter = createRateLimiter(config.rateLimitPerMin);

  // CORS. No Origin header (curl, server-to-server) = not a browser, let it through.
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (!origin) return next();
    const allowed = isAllowedOrigin(origin);
    c.header("Vary", "Origin");
    if (allowed) c.header("Access-Control-Allow-Origin", origin);

    if (c.req.method === "OPTIONS") {
      if (allowed) {
        c.header("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        c.header("Access-Control-Allow-Headers", "Content-Type");
        c.header("Access-Control-Max-Age", "600");
      }
      return c.body(null, 204);
    }
    if (!allowed && c.req.method === "POST") throw new ApiError("origin_not_allowed");
    return next();
  });

  app.get("/health", (c) =>
    c.json({ ok: true, provider: provider.name, configured: provider.configured, concerns: config.concerns }),
  );

  app.post("/v1/analyze", async (c) => {
    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const decision = limiter.hit(ip, now());
    if (!decision.ok) {
      c.header("Retry-After", String(decision.retryAfterSec));
      throw new ApiError("rate_limited");
    }
    if (!provider.configured) throw new ApiError("not_configured");

    const mediaType = c.req.header("content-type")?.split(";")[0]?.trim().toLowerCase();
    const photos =
      mediaType === "multipart/form-data"
        ? await readMultipartPhotos(c.req.raw, config.maxImageBytes)
        : await readRawPhoto(c.req.raw, mediaType, config.maxImageBytes);

    const started = now();
    try {
      const result = await provider.analyze({ ...photos, concerns: config.concerns });
      logger.info("analyze_ok", {
        provider: provider.name,
        bytes: photos.image.byteLength,
        usedSides: result.usedSides,
        ms: now() - started,
      });
      return c.json(result);
    } catch (err) {
      // Exactly one line per provider failure: provider, step and the provider's status/code. Never the key or image.
      const failure =
        err instanceof ApiError
          ? err
          : new ApiError("provider_error", undefined, { step: "unknown", providerCode: err instanceof Error ? err.name : "unknown" });
      logger.warn("provider_failed", { provider: provider.name, code: failure.code, ...failure.detail, ms: now() - started });
      return c.json(failure.toJSON(), failure.status);
    }
  });

  app.notFound((c) => c.json(new ApiError("not_found").toJSON(), 404));

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      // Rejected before reaching the provider (bad input, origin, rate limit, not configured).
      logger.info("request_rejected", { path: c.req.path, code: err.code, status: err.status });
      return c.json(err.toJSON(), err.status);
    }
    logger.error("unexpected_error", { path: c.req.path, error: err.name });
    return c.json(new ApiError("internal_error").toJSON(), 500);
  });

  return app;
}
