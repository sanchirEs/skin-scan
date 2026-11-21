// Guided side photos after the front capture, like clinic skin scanners.
// Pure decisions only: the camera screen feeds one sample per frame and acts
// on the returned action.
//
// Which way poseFromMatrix's yaw points in the mirrored preview is not
// certain, so the steps never rely on it: side1 takes either direction and
// remembers it, and side2 asks for the other one.
import { LIMITS, type LightProblem } from "./quality";

export const SIDE = {
  /** Head turn accepted for a side photo, in degrees either way. */
  minYaw: 22,
  maxYaw: 42,
  /** How long the head stays in range and still before the photo is taken. */
  holdMs: 400,
  /** Each side step gives up after this and moves on. */
  timeoutMs: 12_000,
  /** Frames per side burst (the front photo uses 5). */
  frames: 3,
} as const;

export type SideId = "side1" | "side2";
export type Sign = 1 | -1;

/** What the live check saw on one frame. */
export type SideSample = {
  faces: number;
  /** Degrees, from poseFromMatrix. Its sign is not trusted. */
  yaw: number;
  light: LightProblem | null;
  /** Mean landmark movement since the last frame, as a fraction of face width. */
  motion: number;
};

/** "turn" is the step's own prompt (left for side1, right for side2). */
export type SideHint = "turn" | "hold" | "back" | "no-face" | "one-face" | LightProblem;

export type SideAction = "none" | "capture" | "advance" | "done";

export type SideState = {
  step: SideId | "done";
  /** When the current step began, on the same clock as `now`. */
  startedAt: number;
  /** When the current hold began, or null while not holding. */
  holdSince: number | null;
  /** Yaw sign of the side1 photo, once taken. side2 must turn the other way. */
  sign: Sign | null;
};

export type SideResult = {
  state: SideState;
  action: SideAction;
  hint: SideHint;
  /** 0..1 progress of the current hold, for the hold pads. */
  hold: number;
  /** With "capture": the step whose photo to take, and the yaw sign it was held at. */
  capture?: { step: SideId; sign: Sign };
};

export function startSides(now: number): SideState {
  return { step: "side1", startedAt: now, holdSince: null, sign: null };
}

const nextStep = (s: SideState, now: number, sign: Sign | null): SideState =>
  s.step === "side1"
    ? { step: "side2", startedAt: now, holdSince: null, sign }
    : { step: "done", startedAt: s.startedAt, holdSince: null, sign: s.sign };

/** What one frame means for the current side step. */
function judge(s: SideState, q: SideSample): SideHint {
  if (q.faces === 0) return "no-face";
  if (q.faces > 1) return "one-face";
  const size = Math.abs(q.yaw);
  const sign = Math.sign(q.yaw);
  // Still turned towards the side already photographed: ask for the other side.
  if (s.step === "side2" && s.sign !== null && sign === s.sign) return "turn";
  if (size > SIDE.maxYaw) return "back";
  if (size < SIDE.minYaw) return "turn";
  // A turned head always lights one cheek more than the other, so only too dark / too bright count here.
  if (q.light && q.light !== "even-light") return q.light;
  return "hold";
}

export function sideStep(s: SideState, q: SideSample, now: number): SideResult {
  if (s.step === "done") return { state: s, action: "done", hint: "hold", hold: 0 };

  const hint = judge(s, q);
  const still = hint === "hold" && q.motion <= LIMITS.maxMotion;
  const holdSince = still ? (s.holdSince ?? now) : null;
  const held = holdSince === null ? 0 : now - holdSince;

  if (holdSince !== null && held >= SIDE.holdMs) {
    const sign: Sign = q.yaw > 0 ? 1 : -1;
    const state = nextStep(s, now, s.step === "side1" ? sign : s.sign);
    return { state, action: "capture", hint, hold: 1, capture: { step: s.step, sign } };
  }

  if (now - s.startedAt >= SIDE.timeoutMs) {
    const state = nextStep(s, now, s.sign);
    return { state, action: state.step === "done" ? "done" : "advance", hint: "turn", hold: 0 };
  }

  return { state: { ...s, holdSince }, action: "none", hint, hold: Math.min(1, held / SIDE.holdMs) };
}

/** The person chose to skip: finish with whatever was already taken. */
export function skipSides(s: SideState): SideResult {
  return { state: { ...s, step: "done", holdSince: null }, action: "done", hint: "hold", hold: 0 };
}

// ASSUMPTION (not yet checked on a phone): a positive yaw from poseFromMatrix
// on the unmirrored camera frame means the person turned their head to THEIR
// left. Reasoning: MediaPipe's canonical face has +X towards the person's left
// (image right in an unmirrored selfie), and a positive turn about +Y swings the
// nose (+Z) towards +X. If a test on a real phone shows the opposite, flip this.
// The photo is named by the cheek facing the camera (clinic convention, and what
// "left_side_image" means to the AI providers): turning to your own left shows
// your RIGHT cheek, so that photo is "right".
const LEFT_TURN_SIGN: Sign = 1;

export function sideLabel(sign: Sign): "left" | "right" {
  return sign === LEFT_TURN_SIGN ? "right" : "left";
}
