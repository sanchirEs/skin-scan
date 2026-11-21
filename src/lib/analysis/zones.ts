// Face zones from MediaPipe Face Landmarker points (478-point mesh).
// Zones are named by IMAGE side (L = smaller x), so they stay correct whether
// or not the frame was mirrored.
import {
  type Mask,
  countMask,
  type Pt,
  dist,
  ellipseMask,
  intersect,
  lerp,
  rasterizePolygon,
  scalePolygon,
  subtract,
  union,
} from "./geometry";

export type ZoneId = "forehead" | "nose" | "cheekL" | "cheekR" | "chin" | "underEyeL" | "underEyeR";
export const ZONE_IDS: ZoneId[] = ["forehead", "nose", "cheekL", "cheekR", "chin", "underEyeL", "underEyeR"];

export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
] as const;
export const LIPS = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 405, 314, 17, 84, 181, 91, 146] as const;
export const EYE_A = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7] as const;
export const EYE_B = [263, 466, 388, 387, 386, 385, 384, 398, 362, 382, 381, 380, 374, 373, 390, 249] as const;
export const BROW_A = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46] as const;
export const BROW_B = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276] as const;
const LID_A = [33, 7, 163, 144, 145, 153, 154, 155, 133];
const LID_B = [263, 249, 390, 373, 374, 380, 381, 382, 362];

const pick = (lm: Pt[], ids: readonly number[]) => ids.map((i) => lm[i]);

/** A four-sided strip around segment a->b with different half-widths at each end. */
function taperedQuad(a: Pt, b: Pt, halfA: number, halfB: number): Pt[] {
  const len = dist(a, b) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  return [
    { x: a.x + nx * halfA, y: a.y + ny * halfA },
    { x: b.x + nx * halfB, y: b.y + ny * halfB },
    { x: b.x - nx * halfB, y: b.y - ny * halfB },
    { x: a.x - nx * halfA, y: a.y - ny * halfA },
  ];
}

/** A band under the lower lid: lid points shifted down by `top`, then by `bottom`. */
function underEyeBand(lid: Pt[], top: number, bottom: number): Pt[] {
  const upper = lid.map((p) => ({ x: p.x, y: p.y + top }));
  const lower = lid.map((p) => ({ x: p.x, y: p.y + bottom })).reverse();
  return [...upper, ...lower];
}

export function buildZones(lm: Pt[], width: number, height: number): Record<ZoneId, Mask> {
  const eyeSpan = dist(lm[33], lm[263]);
  const oval = rasterizePolygon(pick(lm, FACE_OVAL), width, height);

  const blockers = [EYE_A, EYE_B, BROW_A, BROW_B, LIPS]
    .map((ids) => rasterizePolygon(scalePolygon(pick(lm, ids), 1.35), width, height))
    .reduce((acc, m) => union(acc, m));
  const finish = (m: Mask) => subtract(intersect(m, oval), blockers);

  const foreheadC = lerp(lm[9], lm[10], 0.45);
  const forehead = ellipseMask(foreheadC, 0.38 * eyeSpan, 0.33 * dist(lm[9], lm[10]), width, height);

  const [cheekLeftPt, cheekRightPt] = lm[50].x <= lm[280].x ? [lm[50], lm[280]] : [lm[280], lm[50]];
  const cheek = (c: Pt) => ellipseMask(c, 0.22 * eyeSpan, 0.2 * eyeSpan, width, height);

  const noseBottom = lerp(lm[168], lm[4], 0.85);
  const nose = rasterizePolygon(taperedQuad(lm[168], noseBottom, 0.07 * eyeSpan, 0.13 * eyeSpan), width, height);

  const mouthHalf = dist(lm[61], lm[291]) / 2;
  const chin = rasterizePolygon(
    scalePolygon(taperedQuad(lm[17], lm[152], 0.55 * mouthHalf, 0.35 * mouthHalf), 0.85),
    width,
    height,
  );

  const lidA = pick(lm, LID_A);
  const lidB = pick(lm, LID_B);
  const [lidLeft, lidRight] = lm[33].x <= lm[263].x ? [lidA, lidB] : [lidB, lidA];
  const band = (lid: Pt[]) =>
    rasterizePolygon(underEyeBand(lid, 0.1 * eyeSpan, 0.28 * eyeSpan), width, height);

  return {
    forehead: finish(forehead),
    nose: finish(nose),
    cheekL: finish(cheek(cheekLeftPt)),
    cheekR: finish(cheek(cheekRightPt)),
    chin: finish(chin),
    underEyeL: finish(band(lidLeft)),
    underEyeR: finish(band(lidRight)),
  };
}

/**
 * On a turned head the far cheek slips behind the face edge, so the oval cuts
 * its zone down: the cheek with more visible pixels is the one facing the camera.
 */
export function facingCheek(zones: Record<ZoneId, Mask>): "cheekL" | "cheekR" {
  return countMask(zones.cheekL) >= countMask(zones.cheekR) ? "cheekL" : "cheekR";
}
