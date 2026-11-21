// Dev-only demo path (?demo=1): walks the flow without a camera using fixed,
// clearly illustrative readings. Disabled in production unless explicitly enabled.
import type { Analysis } from "@/components/flow/flow";
import { makeFixtureLandmarks } from "./analysis/fixtures";
import { buildZones } from "./analysis/zones";

export const DEMO_ALLOWED =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO === "1";

export const DEMO_READINGS: Analysis["readings"] = [
  { id: "redness", intensity: 52, level: "moderate" },
  { id: "evenness", intensity: 34, level: "mild" },
  { id: "darkCircles", intensity: 61, level: "moderate" },
  { id: "shine", intensity: 71, level: "high", label: "shiny" },
];
export const DEMO_TONE: Analysis["tone"] = { ita: 31.2, category: "intermediate" };

export async function demoAnalysis(): Promise<Analysis> {
  const size = 400;
  const zones = buildZones(makeFixtureLandmarks(size), size, size);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#e9ece8";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#c99674";
  ctx.beginPath();
  ctx.ellipse(200, 210, 120, 160, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#15191b";
  ctx.font = "600 18px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Demo photo", 200, 392);
  const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/jpeg", 0.9));

  return {
    ok: true,
    readings: DEMO_READINGS,
    tone: DEMO_TONE,
    raw: {
      rednessMeanA: 15.1,
      rednessFraction: 0.14,
      evennessStd: 2.6,
      spotCount: 6,
      spotsPerKpx: 0.6,
      darkCircleDeltaL: 9.7,
      shineT: 0.15,
      shineCheeks: 0.03,
      toneL: 58.2,
      toneB: 15.4,
      itaDeg: 31.2,
      zonePixels: { forehead: 5200, nose: 1900, cheekL: 1800, cheekR: 1800, chin: 1300, underEyeL: 700, underEyeR: 700 },
    },
    spots: [
      { x: 132, y: 240 },
      { x: 268, y: 228 },
      { x: 150, y: 222 },
    ],
    photoUrl: URL.createObjectURL(blob),
    zones,
    size: { w: size, h: size },
  };
}
