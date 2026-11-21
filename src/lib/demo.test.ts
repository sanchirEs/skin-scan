import { describe, expect, it } from "vitest";
import { sideStep, startSides, type SideResult } from "./analysis/sides";
import { demoSideSample } from "./demo";

describe("demo side steps", () => {
  it("turn one way, then the other, and finish within a few seconds", () => {
    let state = startSides(0);
    const captures: NonNullable<SideResult["capture"]>[] = [];
    let t = 0;
    for (; t <= 6000 && state.step !== "done"; t += 66) {
      const out = sideStep(state, demoSideSample(t), t);
      if (out.capture) captures.push(out.capture);
      state = out.state;
    }
    expect(state.step).toBe("done");
    expect(t).toBeLessThan(4000);
    expect(captures.map((c) => c.step)).toEqual(["side1", "side2"]);
    expect(captures[0].sign).toBe(-captures[1].sign);
  });
});
