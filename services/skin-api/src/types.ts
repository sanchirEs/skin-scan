/** Our concern ids. The app and every provider speak these, never provider-specific names. */
export const CONCERN_IDS = [
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
export type ConcernId = (typeof CONCERN_IDS)[number];

export const PROVIDER_NAMES = ["youcam", "ailabtools", "mock"] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export type ImageType = "image/jpeg" | "image/png";
export type Level = "none" | "mild" | "moderate" | "high";

export interface Region {
  name: string;
  score: number;
}

export interface Concern {
  id: ConcernId;
  /** 1..100, higher = healthier skin. */
  score: number;
  /** 100 - score. */
  severity: number;
  level: Level;
  maskUrl: string | null;
  regions: Region[];
}

/** The 200 body of POST /v1/analyze. */
export interface AnalysisResult {
  provider: ProviderName;
  concerns: Concern[];
  skinAge: number | null;
  /** true only if the provider actually analyzed the side photos. */
  usedSides: boolean;
}

export interface AnalyzeInput {
  /** Raw image bytes of the front photo. Held in memory only; never stored or logged. */
  image: Uint8Array<ArrayBuffer>;
  contentType: ImageType;
  /** Which concerns to return, in this order. */
  concerns: readonly ConcernId[];
  /** Optional photos with the face turned to each side (JPEG or PNG bytes). Providers may ignore them. */
  sides?: { left?: Uint8Array<ArrayBuffer>; right?: Uint8Array<ArrayBuffer> };
}

/**
 * Every skin-analysis provider implements this. Throw ApiError for anything the
 * client should see (no_face, timeout, provider_error, ...).
 */
export interface SkinProvider {
  readonly name: ProviderName;
  /** false when a required secret is missing; /v1/analyze then answers 503 not_configured. */
  readonly configured: boolean;
  analyze(input: AnalyzeInput): Promise<AnalysisResult>;
}
