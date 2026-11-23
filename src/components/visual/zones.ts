import type { AiConcernId } from "@/lib/ai/types";
import type { MeasureId } from "@/lib/analysis/types";
import type { ZoneId } from "@/lib/analysis/zones";

/** Where each on-phone reading is measured. Matches the zones drawn on the photo. */
export const MEASURE_ZONES: Record<MeasureId, ZoneId[]> = {
  redness: ["cheekL", "cheekR", "nose"],
  evenness: ["cheekL", "cheekR", "forehead"],
  darkCircles: ["underEyeL", "underEyeR"],
  shine: ["forehead", "nose"],
};

/** Where each AI concern usually shows, for the emblem only. */
export const AI_ZONES: Record<AiConcernId, ZoneId[]> = {
  acne: ["forehead", "cheekL", "cheekR", "chin"],
  wrinkles: ["forehead", "underEyeL", "underEyeR"],
  pores: ["nose", "cheekL", "cheekR"],
  texture: ["cheekL", "cheekR", "forehead"],
  spots: ["cheekL", "cheekR", "forehead"],
  redness: ["cheekL", "cheekR", "nose"],
  oiliness: ["forehead", "nose"],
  darkCircles: ["underEyeL", "underEyeR"],
  eyeBags: ["underEyeL", "underEyeR"],
  moisture: ["cheekL", "cheekR"],
  radiance: ["forehead", "cheekL", "cheekR", "chin"],
  firmness: ["cheekL", "cheekR", "chin"],
};
