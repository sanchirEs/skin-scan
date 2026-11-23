// Full-resolution analysis of the captured frames, entirely on the device.
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Mask, Pt } from "../analysis/geometry";
import { measure } from "../analysis/measure";
import { combineSides, sideIntensities, toReadings, type SideIntensities } from "../analysis/readings";
import type { RawMetrics, Reading, Tone } from "../analysis/types";
import { FACE_OVAL, buildZones, facingCheek, type ZoneId } from "../analysis/zones";
import { withTimeout } from "../timeout";
import { loadLandmarker } from "./landmarker";

const WORK_WIDTH = 480;
/** A side photo that takes longer than this is left out; the front result never waits on it. */
const SIDE_TIMEOUT_MS = 10_000;

export type SidePhotos<T> = { left?: T; right?: T };

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
      /** The same kind of crop of each side photo that measured, for the AI check only. Memory only. */
      sideBlobs: SidePhotos<Blob>;
    }
  | { ok: false; reason: "no-face" | "too-few-pixels" | "overexposed" | "underexposed" };

/** The face region of a frame (with a margin), drawn at WORK_WIDTH, and the landmarks mapped into it. */
function cropFace(bitmap: ImageBitmap, lm: NormalizedLandmark[]) {
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
  return { region: { cx, cy, cw, ch }, canvas, img, pts, w, h };
}

type Region = { cx: number; cy: number; cw: number; ch: number };

/**
 * The region grown by `fx` of its width on each side and `fy` of its height above and below, kept inside the
 * frame. Side photos need it: the tight face-oval crop of a turned head cuts off the jaw and ear, and the AI
 * service then answers "unable to recognize face" and fails the whole check.
 */
export function widenRegion(r: Region, frame: { width: number; height: number }, fx: number, fy: number): Region {
  const cx = Math.max(0, r.cx - r.cw * fx);
  const cy = Math.max(0, r.cy - r.ch * fy);
  return {
    cx,
    cy,
    cw: Math.min(frame.width, r.cx + r.cw * (1 + fx)) - cx,
    ch: Math.min(frame.height, r.cy + r.ch * (1 + fy)) - cy,
  };
}

/** Same region at up to 1280 px wide (at least 480, the AI service's minimum). */
function uploadCrop(bitmap: ImageBitmap, r: { cx: number; cy: number; cw: number; ch: number }): Promise<Blob | null> {
  const uw = Math.round(Math.min(1280, Math.max(480, r.cw)));
  const uh = Math.round(r.ch * (uw / r.cw));
  const upload = document.createElement("canvas");
  upload.width = uw;
  upload.height = uh;
  upload.getContext("2d")!.drawImage(bitmap, r.cx, r.cy, r.cw, r.ch, 0, 0, uw, uh);
  return new Promise<Blob | null>((resolve) => upload.toBlob(resolve, "image/jpeg", 0.9));
}

export async function analyzeFrame(bitmap: ImageBitmap): Promise<FrameAnalysis> {
  const landmarker = await loadLandmarker("IMAGE");
  const res = landmarker.detect(bitmap);
  if (!res.faceLandmarks.length) return { ok: false, reason: "no-face" };

  const { region, canvas, img, pts, w, h } = cropFace(bitmap, res.faceLandmarks[0]);
  const zones = buildZones(pts, w, h);
  const measured = measure({ width: w, height: h, data: img.data }, zones);
  if (!measured.ok) return { ok: false, reason: measured.reason };

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo encode failed"))), "image/jpeg", 0.9),
  );
  const uploadBlob = await uploadCrop(bitmap, region);

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
    sideBlobs: {},
  };
}

export type SideAnalysis = { ok: true; intensities: SideIntensities; uploadBlob: Blob | null } | { ok: false };

/**
 * A side photo: only the cheek facing the camera is measured, and only for
 * redness and evenness (spots). The rest of the reading stays front-only.
 */
export async function analyzeSide(bitmap: ImageBitmap): Promise<SideAnalysis> {
  const landmarker = await loadLandmarker("IMAGE");
  const res = landmarker.detect(bitmap);
  if (!res.faceLandmarks.length) return { ok: false };

  const { region, img, pts, w, h } = cropFace(bitmap, res.faceLandmarks[0]);
  const zones = buildZones(pts, w, h);
  const measured = measure({ width: w, height: h, data: img.data }, zones, { only: [facingCheek(zones)] });
  if (!measured.ok) return { ok: false };
  const uploadRegion = widenRegion(region, bitmap, 0.3, 0.15);
  return { ok: true, intensities: sideIntensities(measured.raw), uploadBlob: await uploadCrop(bitmap, uploadRegion) };
}

/** Adds what the side photos show to a front analysis. A side that fails is left out, silently. */
export async function addSides(
  front: Extract<FrameAnalysis, { ok: true }>,
  sides: SidePhotos<ImageBitmap>,
): Promise<Extract<FrameAnalysis, { ok: true }>> {
  const found: SideIntensities[] = [];
  const sideBlobs: SidePhotos<Blob> = {};
  for (const key of ["left", "right"] as const) {
    const bitmap = sides[key];
    if (!bitmap) continue;
    try {
      const side = await withTimeout(analyzeSide(bitmap), SIDE_TIMEOUT_MS);
      if (!side.ok) continue;
      found.push(side.intensities);
      if (side.uploadBlob) sideBlobs[key] = side.uploadBlob;
    } catch {
      // A side photo is a bonus: the front reading stands on its own.
    }
  }
  return { ...front, readings: combineSides(front.readings, found), sideBlobs };
}
