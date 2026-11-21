// Raw colour metrics -> 0..100 intensities and plain levels.
// Starting thresholds; tune them with ?debug=1 and the anonymous scan log.
import { itaCategory } from "../color/convert";
import type { Level, RawMetrics, Reading, Tone } from "./types";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

export function levelOf(intensity: number): Level {
  if (intensity < 20) return "none";
  if (intensity < 45) return "mild";
  if (intensity < 70) return "moderate";
  return "high";
}

const rednessOf = (raw: RawMetrics) =>
  70 * clamp01((raw.rednessFraction - 0.03) / 0.22) + 30 * clamp01((raw.rednessMeanA - 10) / 12);
const evennessOf = (raw: RawMetrics) =>
  60 * clamp01((raw.evennessStd - 1.2) / 3.8) + 40 * clamp01(raw.spotsPerKpx / 1.5);

export function toReadings(raw: RawMetrics): { readings: Reading[]; tone: Tone } {
  const redness = rednessOf(raw);
  const evenness = evennessOf(raw);
  const darkCircles = 100 * clamp01((raw.darkCircleDeltaL - 3) / 11);
  const shine = 100 * clamp01((raw.shineT - 0.02) / 0.18);

  const r = (id: Reading["id"], v: number): Reading => {
    const intensity = Math.round(v);
    return { id, intensity, level: levelOf(intensity) };
  };

  const shineReading = r("shine", shine);
  shineReading.label = shine < 20 ? "matte" : shine < 55 ? "balanced" : "shiny";

  return {
    readings: [r("redness", redness), r("evenness", evenness), r("darkCircles", darkCircles), shineReading],
    tone: { ita: Math.round(raw.itaDeg * 10) / 10, category: itaCategory(raw.itaDeg) },
  };
}

/** What a side photo adds: the two measures it reads on the cheek facing the camera. */
export type SideIntensities = { redness: number; evenness: number };

export function sideIntensities(raw: RawMetrics): SideIntensities {
  return { redness: Math.round(rednessOf(raw)), evenness: Math.round(evennessOf(raw)) };
}

/**
 * Side photos see each cheek face-on, so they can only raise redness and
 * evenness: each becomes the strongest of the front and side readings.
 * Dark circles, shine and tone stay front-only.
 */
export function combineSides(front: Reading[], sides: SideIntensities[]): Reading[] {
  return front.map((r) => {
    if (r.id !== "redness" && r.id !== "evenness") return r;
    const id = r.id;
    const best = Math.max(r.intensity, ...sides.map((s) => s[id]).filter(Number.isFinite));
    return best === r.intensity ? r : { ...r, intensity: best, level: levelOf(best) };
  });
}
