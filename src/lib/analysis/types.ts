import type { ToneCategory } from "../color/convert";
import type { Pt } from "./geometry";
import type { ZoneId } from "./zones";

export type Rgba = { width: number; height: number; data: Uint8ClampedArray };

export type RawMetrics = {
  rednessMeanA: number;
  rednessFraction: number;
  evennessStd: number;
  spotCount: number;
  spotsPerKpx: number;
  darkCircleDeltaL: number;
  shineT: number;
  shineCheeks: number;
  toneL: number;
  toneB: number;
  itaDeg: number;
  zonePixels: Record<ZoneId, number>;
};

export type MeasureFailure = "too-few-pixels" | "overexposed" | "underexposed";

export type MeasureResult =
  | { ok: true; raw: RawMetrics; maps: { redness: Uint8Array; spots: Pt[] } }
  | { ok: false; reason: MeasureFailure };

export type Level = "none" | "mild" | "moderate" | "high";
export type MeasureId = "redness" | "evenness" | "darkCircles" | "shine";
export const MEASURE_IDS: MeasureId[] = ["redness", "evenness", "darkCircles", "shine"];

export type Reading = { id: MeasureId; intensity: number; level: Level; label?: "matte" | "balanced" | "shiny" };
export type Tone = { ita: number; category: ToneCategory };
