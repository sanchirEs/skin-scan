import { describe, expect, it, vi } from "vitest";
import { flowReducer, initialFlow, type Analysis, type Captured, type FlowState } from "./flow";

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };

function capturedWithSides() {
  const front = bitmap();
  const left = bitmap();
  const right = bitmap();
  const captured: Captured = { bitmap: front, quality: {}, sides: { left, right } };
  return { captured, all: [front, left, right] };
}

const analysis = { photoUrl: "" } as unknown as Analysis;

describe("flowReducer frees captured frames", () => {
  it("closes the front and side bitmaps once the analysis is done, keeping the same object", () => {
    const { captured, all } = capturedWithSides();
    const s: FlowState = { ...initialFlow, step: "analyzing", captured };
    const next = flowReducer(s, { type: "analyzed", analysis });
    for (const b of all) expect(b.close).toHaveBeenCalled();
    expect(next.captured).toBe(captured);
  });

  it("closes them on retake", () => {
    const { captured, all } = capturedWithSides();
    flowReducer({ ...initialFlow, step: "report", captured }, { type: "retake" });
    for (const b of all) expect(b.close).toHaveBeenCalled();
  });

  it("closes the old frames when a new capture replaces them", () => {
    const old = capturedWithSides();
    const fresh = capturedWithSides();
    const next = flowReducer({ ...initialFlow, step: "camera", captured: old.captured }, { type: "captured", captured: fresh.captured });
    for (const b of old.all) expect(b.close).toHaveBeenCalled();
    for (const b of fresh.all) expect(b.close).not.toHaveBeenCalled();
    expect(next.captured).toBe(fresh.captured);
  });
});
