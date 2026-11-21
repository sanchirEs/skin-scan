// Live quality checks on the camera preview, and the capture burst.
import type { FaceLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { isSpecular, srgbToLab } from "../color/convert";
import { checkQuality, laplacianVariance, poseFromMatrix, type Hint } from "../analysis/quality";
import { FACE_OVAL } from "../analysis/zones";

const SAMPLE_W = 160;
let sampleCanvas: HTMLCanvasElement | null = null;

function sampleCtx(w: number, h: number) {
  sampleCanvas ??= document.createElement("canvas");
  if (sampleCanvas.width !== w || sampleCanvas.height !== h) {
    sampleCanvas.width = w;
    sampleCanvas.height = h;
  }
  return sampleCanvas.getContext("2d", { willReadFrequently: true })!;
}

export type LiveResult = {
  hint: Hint;
  landmarks: NormalizedLandmark[] | null;
  metrics: { faceWidth: number; light: number; yaw: number };
};

function faceBox(lm: NormalizedLandmark[]) {
  let x0 = 1;
  let y0 = 1;
  let x1 = 0;
  let y1 = 0;
  for (const i of FACE_OVAL) {
    const p = lm[i];
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Median L* and clipped share in a small disc around a landmark, from a downscaled frame. */
function discStats(data: Uint8ClampedArray, w: number, h: number, cx: number, cy: number, r: number) {
  const ls: number[] = [];
  let clipped = 0;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, cy + r); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, cx + r); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
      const i = (y * w + x) * 4;
      const [L] = srgbToLab(data[i], data[i + 1], data[i + 2]);
      if (isSpecular(data[i], data[i + 1], data[i + 2]) || L > 97) clipped++;
      ls.push(L);
    }
  }
  ls.sort((a, b) => a - b);
  return { median: ls.length ? ls[ls.length >> 1] : 0, clipped, n: ls.length };
}

export function liveQuality(
  video: HTMLVideoElement,
  landmarker: FaceLandmarker,
  prev: NormalizedLandmark[] | null,
  ts: number,
): LiveResult {
  const res = landmarker.detectForVideo(video, ts);
  const faces = res.faceLandmarks.length;
  const none = { faceWidth: 0, light: 0, yaw: 0 };
  if (faces === 0) return { hint: "no-face", landmarks: null, metrics: none };
  const lm = res.faceLandmarks[0];

  const vw = video.videoWidth || 1;
  const vh = video.videoHeight || 1;
  const box = faceBox(lm);
  // Size is judged against the frame's short side, so portrait and landscape agree.
  const shortSide = Math.min(vw, vh);
  const sized = { ...box, w: (box.w * vw) / shortSide };

  const m = res.facialTransformationMatrixes?.[0]?.data;
  const pose = m ? poseFromMatrix(m) : { yaw: 0, pitch: 0, roll: 0 };

  const sh = Math.round((SAMPLE_W * vh) / vw);
  const ctx = sampleCtx(SAMPLE_W, sh);
  ctx.drawImage(video, 0, 0, SAMPLE_W, sh);
  const { data } = ctx.getImageData(0, 0, SAMPLE_W, sh);
  const r = Math.max(2, box.w * SAMPLE_W * 0.08);
  const a = discStats(data, SAMPLE_W, sh, lm[50].x * SAMPLE_W, lm[50].y * sh, r);
  const b = discStats(data, SAMPLE_W, sh, lm[280].x * SAMPLE_W, lm[280].y * sh, r);
  const [left, right] = lm[50].x <= lm[280].x ? [a, b] : [b, a];

  let motion = 0;
  if (prev) {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < lm.length; i += 12) {
      sum += Math.hypot(lm[i].x - prev[i].x, lm[i].y - prev[i].y);
      n++;
    }
    motion = sum / n / (box.w || 1);
  }

  const hint = checkQuality({
    faces,
    bbox: sized,
    poseDeg: pose,
    cheekL: left.median,
    cheekR: right.median,
    clippedShare: (a.clipped + b.clipped) / Math.max(1, a.n + b.n),
    motion,
  });
  return { hint, landmarks: lm, metrics: { faceWidth: sized.w, light: (left.median + right.median) / 2, yaw: pose.yaw } };
}

function sharpness(bitmap: ImageBitmap): number {
  const w = SAMPLE_W;
  const h = Math.round((SAMPLE_W * bitmap.height) / bitmap.width);
  const ctx = sampleCtx(w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) | 0;
  return laplacianVariance(gray, w, h);
}

/** Grabs n frames ~80ms apart and keeps the sharpest. */
export async function captureBurst(video: HTMLVideoElement, n = 5): Promise<{ bitmap: ImageBitmap; sharpness: number }> {
  let best: { bitmap: ImageBitmap; sharpness: number } | null = null;
  try {
    for (let k = 0; k < n; k++) {
      const bmp = await createImageBitmap(video);
      const s = sharpness(bmp);
      if (!best || s > best.sharpness) {
        best?.bitmap.close();
        best = { bitmap: bmp, sharpness: s };
      } else {
        bmp.close();
      }
      if (k < n - 1) await new Promise((r) => setTimeout(r, 80));
    }
  } catch (err) {
    best?.bitmap.close();
    throw err;
  }
  if (!best) throw new Error("no frame captured");
  return best;
}
