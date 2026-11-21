import { z } from "zod";
import { CONCERN_IDS, PROVIDER_NAMES, type ConcernId, type ProviderName } from "./types.js";

export interface Config {
  port: number;
  provider: ProviderName;
  youcam: { apiKey: string | undefined; baseUrl: string };
  concerns: ConcernId[];
  /** Exact origins or patterns with "*" (matches one or more of [A-Za-z0-9-]). */
  allowedOrigins: string[];
  rateLimitPerMin: number;
  maxImageBytes: number;
}

/** "a, b,,a" -> ["a", "b"] */
const list = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((s) => [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))]);

/** Positive integer; "5_000_000" is accepted. */
const int = (fallback: number) =>
  z
    .string()
    .default(String(fallback))
    .transform((s) => Number(s.replace(/_/g, "")))
    .pipe(z.number().int().positive());

const Env = z.object({
  PORT: int(8080),
  SKIN_PROVIDER: z.enum(PROVIDER_NAMES).default("youcam"),
  YOUCAM_API_KEY: z.string().optional(),
  YOUCAM_BASE_URL: z.url().default("https://yce-api-01.makeupar.com"),
  SKIN_CONCERNS: list("acne,wrinkles,pores,texture").pipe(z.array(z.enum(CONCERN_IDS)).min(1)),
  ALLOWED_ORIGINS: list(""),
  RATE_LIMIT_PER_MIN: int(6),
  MAX_IMAGE_BYTES: int(5_000_000),
});

/** Parse env vars once at startup. Throws a readable error (without values) when something is invalid. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // Unset and blank are the same thing (Railway lets you save empty variables).
  const present = Object.fromEntries(
    Object.entries(env)
      .map(([k, v]) => [k, v?.trim()] as const)
      .filter(([, v]) => v !== undefined && v !== ""),
  );
  const parsed = Env.safeParse(present);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const e = parsed.data;
  return {
    port: e.PORT,
    provider: e.SKIN_PROVIDER,
    youcam: { apiKey: e.YOUCAM_API_KEY, baseUrl: e.YOUCAM_BASE_URL.replace(/\/+$/, "") },
    concerns: e.SKIN_CONCERNS,
    allowedOrigins: e.ALLOWED_ORIGINS,
    rateLimitPerMin: e.RATE_LIMIT_PER_MIN,
    maxImageBytes: e.MAX_IMAGE_BYTES,
  };
}
