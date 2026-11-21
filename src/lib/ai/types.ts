// Contract with the skin-api service on Railway (services/skin-api).
import type { Level } from "../analysis/types";

export const AI_CONCERN_IDS = [
  "acne",
  "wrinkles",
  "pores",
  "texture",
  "spots",
  "redness",
  "oiliness",
  "darkCircles",
  "eyeBags",
  "moisture",
  "radiance",
  "firmness",
] as const;
export type AiConcernId = (typeof AI_CONCERN_IDS)[number];

export type AiConcern = {
  id: AiConcernId;
  /** Provider health score 1..100, higher is healthier. */
  score: number;
  /** 100 - score: how strongly the concern shows. */
  severity: number;
  level: Level;
  /** Where the provider found it, as an overlay image. Shown, never stored. */
  maskUrl: string | null;
  regions: { name: string; score: number }[];
};

export type AiResult = { provider: string; concerns: AiConcern[]; skinAge: number | null };

export type AiErrorCode =
  | "bad_image"
  | "too_large"
  | "no_face"
  | "face_too_small"
  | "too_dark"
  | "pose"
  | "image_too_small"
  | "rate_limited"
  | "not_configured"
  | "provider_error"
  | "timeout"
  | "network";

export type AiOutcome = { ok: true; result: AiResult } | { ok: false; error: AiErrorCode };
