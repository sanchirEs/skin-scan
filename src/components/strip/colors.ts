// Key ramps for each pad. Mirrors the --red/--even/--dark/--shine tokens in
// globals.css; canvas drawing needs the raw values.
import type { AiConcernId } from "@/lib/ai/types";
import type { MeasureId } from "@/lib/analysis/types";
import type { ToneCategory } from "@/lib/color/convert";

export const RAMPS: Record<MeasureId, [string, string]> = {
  redness: ["#f7e1e1", "#c2263d"],
  evenness: ["#efe6d8", "#6b4a2b"],
  darkCircles: ["#e9e6ef", "#4b3f63"],
  shine: ["#e4e7e8", "#8fd3dd"],
};

export const TONES: { id: ToneCategory; color: string }[] = [
  { id: "very-light", color: "#f1d3c2" },
  { id: "light", color: "#e5b89c" },
  { id: "intermediate", color: "#c99674" },
  { id: "tan", color: "#a97452" },
  { id: "brown", color: "#7a4e33" },
  { id: "dark", color: "#4a2e20" },
];

/** Key ramps for the AI check pads. */
export const AI_RAMPS: Record<AiConcernId, [string, string]> = {
  acne: ["#f6dde6", "#a8325e"],
  wrinkles: ["#e6e6e2", "#5c5a52"],
  pores: ["#ece3da", "#7b5b44"],
  texture: ["#e7ebe0", "#5d6b45"],
  spots: ["#efe6d8", "#6b4a2b"],
  redness: ["#f7e1e1", "#c2263d"],
  oiliness: ["#e4e7e8", "#8fd3dd"],
  darkCircles: ["#e9e6ef", "#4b3f63"],
  eyeBags: ["#e8e4ee", "#5b4e70"],
  moisture: ["#e2edf3", "#3f7891"],
  radiance: ["#f3efdf", "#a68a2c"],
  firmness: ["#ece4e4", "#7a5252"],
};

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Colour on a ramp at t in 0..1. */
export function rampColor(id: MeasureId, t: number): string {
  return mixRamp(RAMPS[id], t);
}

/** Colour on any two-stop ramp at t in 0..1. */
export function mixRamp(ramp: [string, string], t: number): string {
  const [a, b] = ramp.map(hex);
  const k = Math.min(1, Math.max(0, t));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** The printed key: five discrete chips, like the chart on a test kit. */
export function keyChips(id: MeasureId): string[] {
  return rampChips(RAMPS[id]);
}

export function rampChips(ramp: [string, string]): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map((t) => mixRamp(ramp, t));
}
