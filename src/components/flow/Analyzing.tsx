"use client";

import { WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { M } from "@/config/messages";
import { requestAiAnalysis } from "@/lib/ai/client";
import { DEMO_AI, demoAnalysis } from "@/lib/demo";
import { addSides, analyzeFrame, type FrameAnalysis } from "@/lib/vision/analyze-frame";
import { VisionLoadError } from "@/lib/vision/landmarker";
import { TimeoutError, withTimeout } from "@/lib/timeout";
import { RAMPS } from "../strip/colors";
import { Button } from "../ui/Button";
import { FaceMap } from "../visual/FaceMap";
import { MEASURE_ZONES } from "../visual/zones";
import { useFlow } from "./flow";

type Failure = Extract<FrameAnalysis, { ok: false }>["reason"];
const MIN_SHOW_MS = 1100;
const MEASURES = ["redness", "evenness", "darkCircles", "shine"] as const;

export function Analyzing() {
  const { state, dispatch } = useFlow();
  const reduce = useReducedMotion();
  const [failure, setFailure] = useState<Failure | null>(null);

  useEffect(() => {
    let alive = true;
    const started = performance.now();
    (async () => {
      let res: FrameAnalysis;
      try {
        if (state.demo) res = await demoAnalysis();
        else if (!state.captured?.bitmap) res = { ok: false, reason: "no-face" };
        else {
          res = await withTimeout(analyzeFrame(state.captured.bitmap), 30_000);
          // Side photos can only add to redness and evenness; each one that fails is left out.
          if (res.ok) res = await addSides(res, state.captured.sides);
        }
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
      if (!res.ok) return setFailure(res.reason);
      dispatch({ type: "analyzed", analysis: res });
      if (!state.aiConsent) return;
      // The AI check runs in the background while the person answers the quiz.
      const token = Date.now();
      dispatch({ type: "aiStart", token });
      if (state.demo) {
        setTimeout(() => dispatch({ type: "aiDone", token, outcome: { ok: true, result: DEMO_AI } }), 2500);
      } else if (!res.uploadBlob) {
        dispatch({ type: "aiDone", token, outcome: { ok: false, error: "bad_image" } });
      } else {
        requestAiAnalysis({ front: res.uploadBlob, ...res.sideBlobs }).then((outcome) =>
          dispatch({ type: "aiDone", token, outcome }),
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, [state.captured, state.demo, state.aiConsent, dispatch]);

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col px-5 pt-8 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex-1">
        <div className="relative mx-auto aspect-[160/200] w-[46%] max-w-[200px]" aria-busy={!failure}>
          <div aria-hidden className="absolute -inset-[16%] rounded-full bg-cap-tint/70 blur-2xl" />
          <FaceMap
            className="relative h-full w-full"
            scanning={!failure}
            outline={failure ? "var(--ink-faint)" : "var(--ink)"}
            fills={[]}
          />
        </div>

        <h1 className="type-display mt-8 text-center text-[30px]">
          {failure ? M.analyzing.failures[failure] : M.analyzing.title}
        </h1>
        {!failure && <p className="mx-auto mt-3 max-w-[32ch] text-center text-[16px] leading-[1.55] text-ink-soft">{M.analyzing.body}</p>}

        {failure ? (
          <p className="mt-6 flex items-center justify-center gap-2 text-[15px] text-stamp">
            <WarningCircle size={20} weight="fill" aria-hidden />
            {M.analyzing.retakeHint}
          </p>
        ) : (
          <ul className="mx-auto mt-8 grid max-w-[320px] grid-cols-2 gap-2">
            {MEASURES.map((id, i) => (
              <motion.li
                key={id}
                initial={reduce ? false : { opacity: 0.35 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.22 }}
                className="flex items-center gap-2.5 rounded-full bg-strip-raised py-2 pr-3 pl-2 text-[14px] font-semibold lift"
              >
                <span className="relative grid h-6 w-6 place-items-center">
                  <FaceMap className="h-6 w-6" fills={[{ zones: MEASURE_ZONES[id], color: RAMPS[id][1], strength: 0.9 }]} outline="var(--ink-soft)" />
                </span>
                {M.report.measures[id].name}
              </motion.li>
            ))}
          </ul>
        )}
      </div>
      {failure && (
        <Button className="w-full" onClick={() => dispatch({ type: "retake" })}>
          {M.analyzing.retake}
        </Button>
      )}
    </div>
  );
}
