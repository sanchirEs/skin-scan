import { describe, expect, it } from "vitest";
import { LIMITS } from "./quality";
import { SIDE, sideLabel, sideStep, skipSides, startSides, type SideSample, type SideState } from "./sides";

const T0 = 1000;
const at = (yaw: number, patch: Partial<SideSample> = {}): SideSample => ({ faces: 1, yaw, light: null, motion: 0, ...patch });

/** Feeds the same sample every 50 ms from `from` to `to` (inclusive) and returns the last result. */
function hold(state: SideState, sample: SideSample, from: number, to: number) {
  let out = sideStep(state, sample, from);
  for (let t = from + 50; t <= to; t += 50) {
    if (out.action !== "none") break;
    out = sideStep(out.state, sample, t);
  }
  return out;
}

/** A finished side1 capture at the given yaw, returning the side2 state. */
function afterSide1(yaw: number) {
  const out = hold(startSides(T0), at(yaw), T0, T0 + 1000);
  expect(out.action).toBe("capture");
  return out.state;
}

describe("startSides", () => {
  it("starts on the first side with the turn prompt and no hold", () => {
    const s = startSides(T0);
    expect(s.step).toBe("side1");
    expect(s.sign).toBeNull();
    const out = sideStep(s, at(0), T0);
    expect(out).toMatchObject({ action: "none", hint: "turn", hold: 0 });
  });
});

describe("side1 is sign-agnostic", () => {
  it.each([30, -30])("captures a turn of %d degrees and records its sign", (yaw) => {
    const out = hold(startSides(T0), at(yaw), T0, T0 + 1000);
    expect(out.action).toBe("capture");
    expect(out.capture).toEqual({ step: "side1", sign: Math.sign(yaw) });
    expect(out.state.step).toBe("side2");
    expect(out.state.sign).toBe(Math.sign(yaw));
  });
});

describe("yaw range", () => {
  it.each([22, 30, 42, -22, -42])("accepts %d degrees (inclusive range)", (yaw) => {
    expect(hold(startSides(T0), at(yaw), T0, T0 + 1000).action).toBe("capture");
  });

  it.each([0, 10, 21.9, -21.9])("asks to turn at %d degrees and never captures", (yaw) => {
    const out = hold(startSides(T0), at(yaw), T0, T0 + 5000);
    expect(out).toMatchObject({ action: "none", hint: "turn", hold: 0 });
  });

  it.each([42.1, 60, -50])("asks to turn back at %d degrees and never captures", (yaw) => {
    const out = hold(startSides(T0), at(yaw), T0, T0 + 5000);
    expect(out).toMatchObject({ action: "none", hint: "back", hold: 0 });
  });
});

describe("hold timer", () => {
  it("shows Hold there while holding and captures only after the full hold", () => {
    const s = startSides(T0);
    const first = sideStep(s, at(30), T0);
    expect(first).toMatchObject({ action: "none", hint: "hold", hold: 0 });
    const mid = sideStep(first.state, at(30), T0 + SIDE.holdMs / 2);
    expect(mid.action).toBe("none");
    expect(mid.hold).toBeCloseTo(0.5, 5);
    const almost = sideStep(mid.state, at(30), T0 + SIDE.holdMs - 1);
    expect(almost.action).toBe("none");
    const done = sideStep(almost.state, at(30), T0 + SIDE.holdMs);
    expect(done.action).toBe("capture");
    expect(done.hold).toBe(1);
  });

  it("restarts the hold when the head moves", () => {
    let out = sideStep(startSides(T0), at(30), T0);
    out = sideStep(out.state, at(30), T0 + 300);
    out = sideStep(out.state, at(30, { motion: LIMITS.maxMotion * 2 }), T0 + 350);
    expect(out).toMatchObject({ action: "none", hint: "hold", hold: 0 });
    out = sideStep(out.state, at(30), T0 + 400);
    expect(out.action).toBe("none");
    out = sideStep(out.state, at(30), T0 + 400 + SIDE.holdMs);
    expect(out.action).toBe("capture");
  });

  it("restarts the hold when the yaw leaves the range", () => {
    let out = sideStep(startSides(T0), at(30), T0);
    out = sideStep(out.state, at(30), T0 + 300);
    out = sideStep(out.state, at(15), T0 + 350);
    expect(out).toMatchObject({ hint: "turn", hold: 0 });
    out = sideStep(out.state, at(30), T0 + 400);
    expect(out.action).toBe("none");
  });

  it.each(["more-light", "less-light"] as const)("shows the %s hint and does not hold", (light) => {
    const out = hold(startSides(T0), at(30, { light }), T0, T0 + 2000);
    expect(out).toMatchObject({ action: "none", hint: light, hold: 0 });
  });

  it("ignores uneven light on a turned head, where the far cheek is always darker", () => {
    const out = hold(startSides(T0), at(30, { light: "even-light" }), T0, T0 + 500);
    expect(out.action).toBe("capture");
  });

  it("needs exactly one face", () => {
    expect(hold(startSides(T0), at(30, { faces: 0 }), T0, T0 + 2000)).toMatchObject({ action: "none", hint: "no-face" });
    expect(hold(startSides(T0), at(30, { faces: 2 }), T0, T0 + 2000)).toMatchObject({ action: "none", hint: "one-face" });
  });
});

describe("side2 turns the other way", () => {
  it.each([30, -30])("after side1 at %d degrees, refuses the same side", (yaw) => {
    const s2 = afterSide1(yaw);
    const out = hold(s2, at(yaw), T0 + 1000, T0 + 5000);
    expect(out).toMatchObject({ action: "none", hint: "turn", hold: 0 });
  });

  it("says turn, not turn back, when far over on the same side", () => {
    const s2 = afterSide1(30);
    expect(sideStep(s2, at(55), T0 + 1100)).toMatchObject({ action: "none", hint: "turn" });
  });

  it.each([30, -30])("after side1 at %d degrees, captures the opposite side and finishes", (yaw) => {
    const s2 = afterSide1(yaw);
    const out = hold(s2, at(-yaw), T0 + 1000, T0 + 3000);
    expect(out.action).toBe("capture");
    expect(out.capture).toEqual({ step: "side2", sign: -Math.sign(yaw) });
    expect(out.state.step).toBe("done");
  });

  it("asks to turn back when too far on the right side", () => {
    const s2 = afterSide1(30);
    expect(sideStep(s2, at(-50), T0 + 1100)).toMatchObject({ action: "none", hint: "back" });
  });

  it("starts its own timer when side1 is captured", () => {
    const s2 = afterSide1(30);
    expect(s2.startedAt).toBeGreaterThan(T0);
    const out = sideStep(s2, at(0), s2.startedAt + SIDE.timeoutMs - 1);
    expect(out.action).toBe("none");
  });
});

describe("timeout", () => {
  it("moves from side1 to side2 after 12 s without a capture", () => {
    let out = sideStep(startSides(T0), at(0), T0 + SIDE.timeoutMs - 1);
    expect(out.action).toBe("none");
    out = sideStep(out.state, at(0), T0 + SIDE.timeoutMs);
    expect(out.action).toBe("advance");
    expect(out.state).toMatchObject({ step: "side2", sign: null, startedAt: T0 + SIDE.timeoutMs, holdSince: null });
    expect(out.hint).toBe("turn");
  });

  it("gives up even in the middle of a hold", () => {
    let out = sideStep(startSides(T0), at(30), T0 + SIDE.timeoutMs - 100);
    expect(out.hint).toBe("hold");
    out = sideStep(out.state, at(30), T0 + SIDE.timeoutMs);
    expect(out.action).toBe("advance");
  });

  it("lets side2 take either side when side1 timed out", () => {
    for (const yaw of [30, -30]) {
      const s2 = sideStep(startSides(T0), at(0), T0 + SIDE.timeoutMs).state;
      const out = hold(s2, at(yaw), T0 + SIDE.timeoutMs, T0 + SIDE.timeoutMs + 1000);
      expect(out.action).toBe("capture");
      expect(out.capture).toEqual({ step: "side2", sign: Math.sign(yaw) });
    }
  });

  it("finishes after side2 times out", () => {
    const s2 = afterSide1(30);
    const out = sideStep(s2, at(0), s2.startedAt + SIDE.timeoutMs);
    expect(out.action).toBe("done");
    expect(out.state.step).toBe("done");
  });
});

describe("skip", () => {
  it("finishes straight away from either side step", () => {
    const fromSide1 = skipSides(startSides(T0));
    expect(fromSide1.action).toBe("done");
    expect(fromSide1.state.step).toBe("done");
    const fromSide2 = skipSides(afterSide1(30));
    expect(fromSide2.action).toBe("done");
    expect(fromSide2.state.step).toBe("done");
  });

  it("stays done after finishing", () => {
    const done = skipSides(startSides(T0)).state;
    expect(sideStep(done, at(30), T0 + 5000).action).toBe("done");
  });
});

describe("sideLabel", () => {
  it("gives the two sides different labels", () => {
    expect(new Set([sideLabel(1), sideLabel(-1)])).toEqual(new Set(["left", "right"]));
  });

  it("names the photo by the cheek facing the camera, like clinic scanners", () => {
    // ASSUMPTION (see sides.ts): positive yaw = the person turned to their own left,
    // which shows their RIGHT cheek to the camera.
    expect(sideLabel(1)).toBe("right");
  });
});
