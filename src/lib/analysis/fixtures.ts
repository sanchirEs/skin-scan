// Synthetic, frontal face landmarks for unit tests. Only the indices the zone
// builder reads are placed realistically; the rest sit at the face centre.
import type { Pt } from "./geometry";
import { BROW_A, BROW_B, EYE_A, EYE_B, FACE_OVAL, LIPS } from "./zones";

function ring(ids: readonly number[], c: Pt, rx: number, ry: number, out: Pt[], startDeg = -90) {
  ids.forEach((id, i) => {
    const t = ((startDeg + (i * 360) / ids.length) * Math.PI) / 180;
    out[id] = { x: c.x + rx * Math.cos(t), y: c.y + ry * Math.sin(t) };
  });
}

/** Landmarks for a face filling a size x size frame (designed at 400). */
export function makeFixtureLandmarks(size = 400): Pt[] {
  const s = size / 400;
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 200, y: 210 }));
  ring(FACE_OVAL, { x: 200, y: 210 }, 120, 160, lm);
  // Eyes: contour order walks the upper lid then the lower lid.
  ring(EYE_A, { x: 150, y: 170 }, 25, 10, lm, 180);
  ring(EYE_B, { x: 250, y: 170 }, 25, 10, lm, 0);
  lm[33] = { x: 125, y: 170 };
  lm[133] = { x: 175, y: 170 };
  lm[263] = { x: 275, y: 170 };
  lm[362] = { x: 225, y: 170 };
  ring(BROW_A, { x: 150, y: 142 }, 30, 6, lm, 180);
  ring(BROW_B, { x: 250, y: 142 }, 30, 6, lm, 0);
  ring(LIPS, { x: 200, y: 290 }, 35, 15, lm, 180);
  lm[61] = { x: 165, y: 290 };
  lm[291] = { x: 235, y: 290 };
  lm[17] = { x: 200, y: 305 };
  lm[152] = { x: 200, y: 370 };
  lm[9] = { x: 200, y: 150 };
  lm[10] = { x: 200, y: 50 };
  lm[168] = { x: 200, y: 165 };
  lm[4] = { x: 200, y: 245 };
  lm[50] = { x: 140, y: 235 };
  lm[280] = { x: 260, y: 235 };
  // Lower lids, outer to inner corner.
  const lidA = [33, 7, 163, 144, 145, 153, 154, 155, 133];
  const lidB = [263, 249, 390, 373, 374, 380, 381, 382, 362];
  lidA.forEach((id, i) => {
    const x = 125 + (i * 50) / 8;
    lm[id] = { x, y: 170 + 10 * Math.sin((Math.PI * i) / 8) };
  });
  lidB.forEach((id, i) => {
    const x = 275 - (i * 50) / 8;
    lm[id] = { x, y: 170 + 10 * Math.sin((Math.PI * i) / 8) };
  });
  return lm.map((p) => ({ x: p.x * s, y: p.y * s }));
}
