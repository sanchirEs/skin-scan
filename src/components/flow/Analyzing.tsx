"use client";

import { useEffect, useState } from "react";
import { M } from "@/config/messages";
import { demoAnalysis } from "@/lib/demo";
import { analyzeFrame, type FrameAnalysis } from "@/lib/vision/analyze-frame";
import { VisionLoadError } from "@/lib/vision/landmarker";
import { TimeoutError, withTimeout } from "@/lib/timeout";
import { Strip } from "../strip/Strip";
import { Button } from "../ui/Button";
import { useFlow } from "./flow";

type Failure = Extract<FrameAnalysis, { ok: false }>["reason"];
const MIN_SHOW_MS = 1100;

const PENDING = (["redness", "evenness", "darkCircles", "shine"] as const).map((id) => ({
  id,
  intensity: 0,
  label: M.report.measures[id].name,
}));

export function Analyzing() {
  const { state, dispatch } = useFlow();
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let alive = true;
    const started = performance.now();
    (async () => {
      let res: FrameAnalysis;
      try {
        if (state.demo) res = await demoAnalysis();
        else if (!state.captured?.bitmap) res = { ok: false, reason: "no-face" };
        else res = await withTimeout(analyzeFrame(state.captured.bitmap), 30_000);
      } catch (err) {
        if (err instanceof VisionLoadError || err instanceof TimeoutError) {
          dispatch({ type: "go", step: "camera", dir: -1 });
          dispatch({ type: "problem", kind: "model" });
          return;
        }
        console.error(err);
        res = { ok: false, reason: "no-face" };
      }
      const wait = MIN_SHOW_MS - (performance.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (!alive) return;
      if (res.ok) dispatch({ type: "analyzed", analysis: res });
      else setFailure(res.reason);
    })();
    return () => {
      alive = false;
    };
  }, [state.captured, state.demo, dispatch]);

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col px-5 pt-9 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex-1">
        <h1 className="type-display text-[30px]">{failure ? M.analyzing.failures[failure] : M.analyzing.title}</h1>
        {!failure && <p className="mt-3 max-w-[36ch] text-[17px] leading-[1.55] text-ink-soft">{M.analyzing.body}</p>}
        <div className="mt-9" aria-busy={!failure}>
          <Strip pads={PENDING} pending={!failure} />
        </div>
      </div>
      {failure && (
        <Button className="w-full" onClick={() => dispatch({ type: "retake" })}>
          {M.analyzing.retake}
        </Button>
      )}
    </div>
  );
}
