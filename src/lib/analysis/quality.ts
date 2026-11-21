// Live capture checks. The camera screen shows exactly one hint at a time,
// so the order of these checks is the order the user fixes things in.

export type Hint =
  | "no-face"
  | "one-face"
  | "closer"
  | "farther"
  | "center"
  | "straight"
  | "more-light"
  | "less-light"
  | "even-light"
  | "hold-still"
  | "ok";

export type QualityInput = {
  faces: number;
  /** Face box in 0..1 frame units. */
  bbox: { x: number; y: number; w: number; h: number };
  poseDeg: { yaw: number; pitch: number; roll: number };
  /** Median L* of each cheek. */
  cheekL: number;
  cheekR: number;
  /** Share of cheek pixels that are clipped highlights. */
  clippedShare: number;
  /** Mean landmark movement since the last frame, as a fraction of face width. */
  motion: number;
};

export const LIMITS = {
  minWidth: 0.38,
  maxWidth: 0.66,
  maxOffCenter: 0.12,
  maxYawPitch: 12,
  maxRoll: 10,
  // Absolute lightness differs by skin tone, so these only catch a truly dark
  // room or a washed-out frame; clipped highlights catch harsh light, and
  // measure() makes the final under/over-exposure call on the captured frame.
  minLight: 24,
  maxLight: 92,
  maxClipped: 0.12,
  maxSideDiff: 9,
  maxMotion: 0.012,
} as const;

export function checkQuality(q: QualityInput): Hint {
  if (q.faces === 0) return "no-face";
  if (q.faces > 1) return "one-face";
  if (q.bbox.w < LIMITS.minWidth) return "closer";
  if (q.bbox.w > LIMITS.maxWidth) return "farther";
  const cx = q.bbox.x + q.bbox.w / 2;
  const cy = q.bbox.y + q.bbox.h / 2;
  if (Math.abs(cx - 0.5) > LIMITS.maxOffCenter || Math.abs(cy - 0.5) > LIMITS.maxOffCenter) return "center";
  const { yaw, pitch, roll } = q.poseDeg;
  if (Math.abs(yaw) > LIMITS.maxYawPitch || Math.abs(pitch) > LIMITS.maxYawPitch || Math.abs(roll) > LIMITS.maxRoll)
    return "straight";
  const light = lightProblem(q);
  if (light) return light;
  if (q.motion > LIMITS.maxMotion) return "hold-still";
  return "ok";
}

export type LightProblem = "more-light" | "less-light" | "even-light";

/** The light checks alone, in the same order: used where the head is meant to be turned. */
export function lightProblem(q: Pick<QualityInput, "cheekL" | "cheekR" | "clippedShare">): LightProblem | null {
  const light = (q.cheekL + q.cheekR) / 2;
  if (light < LIMITS.minLight) return "more-light";
  if (q.clippedShare > LIMITS.maxClipped || light > LIMITS.maxLight) return "less-light";
  if (Math.abs(q.cheekL - q.cheekR) > LIMITS.maxSideDiff) return "even-light";
  return null;
}

/** Yaw, pitch, roll in degrees from a column-major 4x4 transform (MediaPipe layout). */
export function poseFromMatrix(m: number[]): { yaw: number; pitch: number; roll: number } {
  const r = (row: number, col: number) => m[col * 4 + row];
  const deg = 180 / Math.PI;
  const yaw = Math.atan2(-r(2, 0), Math.hypot(r(2, 1), r(2, 2))) * deg;
  const pitch = Math.atan2(r(2, 1), r(2, 2)) * deg;
  const roll = Math.atan2(r(1, 0), r(0, 0)) * deg;
  return { yaw, pitch, roll };
}

/** Variance of the 4-neighbour Laplacian: higher means sharper. */
export function laplacianVariance(gray: Uint8Array, w: number, h: number): number {
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
      sum += v;
      sum2 += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sum2 / n - mean * mean;
}
