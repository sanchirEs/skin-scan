// Full-resolution analysis of the captured frame, entirely on the device.
import type { Mask, Pt } from "../analysis/geometry";
import { measure } from "../analysis/measure";
import { toReadings } from "../analysis/readings";
import type { RawMetrics, Reading, Tone } from "../analysis/types";
import { FACE_OVAL, buildZones, type ZoneId } from "../analysis/zones";
import { loadLandmarker } from "./landmarker";

const WORK_WIDTH = 480;

export type FrameAnalysis =
  | {
      ok: true;
      readings: Reading[];
      tone: Tone;
      raw: RawMetrics;
      spots: Pt[];
      /** Unmirrored crop as a local object URL. Never uploaded. */
      photoUrl: string;
      zones: Record<ZoneId, Mask>;
      size: { w: number; h: number };
      /** Higher-resolution crop of the same region, for the AI check only. Memory only. */
      uploadBlob: Blob | null;
    }
  | { ok: false; reason: "no-face" | "too-few-pixels" | "overexposed" | "underexposed" };

export async function analyzeFrame(bitmap: ImageBitmap): Promise<FrameAnalysis> {
  const landmarker = await loadLandmarker("IMAGE");
  const res = landmarker.detect(bitmap);
  if (!res.faceLandmarks.length) return { ok: false, reason: "no-face" };
  const lm = res.faceLandmarks[0];

  const W = bitmap.width;
  const H = bitmap.height;
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  for (const i of FACE_OVAL) {
    x0 = Math.min(x0, lm[i].x * W);
    y0 = Math.min(y0, lm[i].y * H);
    x1 = Math.max(x1, lm[i].x * W);
    y1 = Math.max(y1, lm[i].y * H);
  }
  const mx = (x1 - x0) * 0.12;
  const my = (y1 - y0) * 0.12;
  const cx = Math.max(0, x0 - mx);
  const cy = Math.max(0, y0 - my);
  const cw = Math.min(W, x1 + mx) - cx;
  const ch = Math.min(H, y1 + my) - cy;
  const scale = WORK_WIDTH / cw;
  const w = WORK_WIDTH;
  const h = Math.round(ch * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, cx, cy, cw, ch, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);

  const pts: Pt[] = lm.map((p) => ({ x: (p.x * W - cx) * scale, y: (p.y * H - cy) * scale }));
  const zones = buildZones(pts, w, h);
  const measured = measure({ width: w, height: h, data: img.data }, zones);
  if (!measured.ok) return { ok: false, reason: measured.reason };

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo encode failed"))), "image/jpeg", 0.9),
  );
  // Same region at up to 1280 px wide (at least 480, the AI service's minimum).
  const uw = Math.round(Math.min(1280, Math.max(480, cw)));
  const uh = Math.round(ch * (uw / cw));
  const upload = document.createElement("canvas");
  upload.width = uw;
  upload.height = uh;
  upload.getContext("2d")!.drawImage(bitmap, cx, cy, cw, ch, 0, 0, uw, uh);
  const uploadBlob = await new Promise<Blob | null>((resolve) => upload.toBlob(resolve, "image/jpeg", 0.9));

  const { readings, tone } = toReadings(measured.raw);
  return {
    ok: true,
    readings,
    tone,
    raw: measured.raw,
    spots: measured.maps.spots,
    photoUrl: URL.createObjectURL(blob),
    zones,
    size: { w, h },
    uploadBlob,
  };
}
