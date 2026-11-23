"use client";

import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { M } from "@/config/messages";
import type { Hint } from "@/lib/analysis/quality";
import {
  SIDE,
  sideLabel,
  sideStep,
  skipSides,
  startSides,
  type SideHint,
  type SideId,
  type SideSample,
  type SideState,
} from "@/lib/analysis/sides";
import { demoSideSample } from "@/lib/demo";
import { cameraErrorKind } from "@/lib/env/camera-support";
import type { SidePhotos } from "@/lib/vision/analyze-frame";
import { captureBurst, liveQuality } from "@/lib/vision/capture";
import { loadLandmarker } from "@/lib/vision/landmarker";
import { withTimeout } from "@/lib/timeout";
import { Button } from "../ui/Button";
import { CameraProblem } from "./CameraProblem";
import { useFlow, type Captured, type FlowState } from "./flow";

const HOLD_MS = 1000;
/** A permission prompt or camera start that hangs (some in-app browsers) gives up here. */
const CAMERA_TIMEOUT_MS = 20_000;
/** About 18 MB of model and runtime on a slow phone connection. */
const MODEL_TIMEOUT_MS = 30_000;
/** Demo mode: how long the front "photo" takes, and the pace of the simulated side frames. */
const DEMO_FRONT_MS = 1600;
const DEMO_FRAME_MS = 66;

type Phase = "front" | SideId;
type View = { phase: Phase; hint: Hint; sideHint: SideHint; hold: number; capturing: boolean };
const START: View = { phase: "front", hint: "no-face", sideHint: "turn", hold: 0, capturing: false };

/**
 * Wiring for the side steps in lib/analysis/sides.ts: feeds it one sample per
 * frame, takes each photo it asks for, and hands the photos over at the end.
 * Shared by the live camera and the demo.
 */
function sideRunner(io: {
  takePhoto: () => Promise<ImageBitmap | null>;
  show: (v: Partial<View>) => void;
  finish: (photos: SidePhotos<ImageBitmap>) => void;
}) {
  let state: SideState | null = null;
  let busy = false;
  let over = false;
  const photos: SidePhotos<ImageBitmap> = {};

  const end = () => {
    if (over) return;
    over = true;
    io.finish({ ...photos });
  };
  // After a photo or a timeout: show the next step's prompt, or finish.
  const next = (s: SideState) =>
    s.step === "done" ? end() : io.show({ phase: s.step, sideHint: "turn", hold: 0, capturing: false });

  return {
    get active() {
      return state !== null && !over;
    },
    get busy() {
      return busy;
    },
    start(now: number) {
      state = startSides(now);
      next(state);
    },
    skip() {
      if (!state || over) return;
      state = skipSides(state).state;
      // A photo being taken right now is kept: its callback finishes.
      if (!busy) end();
    },
    sample(q: SideSample, now: number) {
      if (!state || busy || over) return;
      const out = sideStep(state, q, now);
      const s = (state = out.state);
      if (out.action === "done" || out.action === "advance") return next(s);
      io.show({ sideHint: out.hint, hold: out.hold });
      if (out.action !== "capture" || !out.capture) return;
      const label = sideLabel(out.capture.sign);
      busy = true;
      io.show({ capturing: true });
      io.takePhoto().then(
        (bitmap) => {
          busy = false;
          if (over) return bitmap?.close();
          if (bitmap) {
            photos[label]?.close();
            photos[label] = bitmap;
          }
          // `state` may have been skipped to "done" while the photo was taken.
          next(state ?? s);
        },
        // The camera stopped mid-photo: keep what was already taken.
        () => {
          busy = false;
          end();
        },
      );
    },
    /** Unmounted before the end: free the photos nobody will read. */
    dispose() {
      if (over) return;
      over = true;
      photos.left?.close();
      photos.right?.close();
    },
  };
}

function sideMessage(phase: SideId, hint: SideHint): string {
  if (hint === "turn") return M.camera.sides.prompts[phase];
  if (hint === "hold" || hint === "back") return M.camera.sides.hints[hint];
  return M.camera.hints[hint];
}

export function Camera() {
  const { state, dispatch } = useFlow();
  const reduce = useReducedMotion();
  const videoRef = useRef<HTMLVideoElement>(null);
  /** Set by the running effect: ends the side steps with what was taken. */
  const skipRef = useRef<() => void>(() => {});
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>(START);

  useEffect(() => {
    let cancelled = false;
    /** Once dispatched, the flow owns the bitmaps. Until then this effect frees them. */
    let handedOver = false;
    const show = (p: Partial<View>) => {
      if (cancelled) return;
      setView((v) => ((Object.keys(p) as (keyof View)[]).every((k) => v[k] === p[k]) ? v : { ...v, ...p }));
    };
    const hand = (captured: Captured) => {
      handedOver = true;
      dispatch({ type: "captured", captured });
    };

    if (state.demo) {
      // No camera and no bitmaps: the side steps run on a simulated head turn.
      let frames = 0;
      let sidesStart = 0;
      const sides = sideRunner({
        takePhoto: async () => null,
        show,
        finish: () => {
          clearInterval(frames);
          if (!cancelled) hand({ bitmap: null, quality: {}, sides: {} });
        },
      });
      skipRef.current = () => sides.skip();
      const t = setTimeout(() => {
        sidesStart = performance.now();
        sides.start(sidesStart);
        frames = window.setInterval(() => {
          const now = performance.now();
          sides.sample(demoSideSample(now - sidesStart), now);
        }, DEMO_FRAME_MS);
      }, DEMO_FRONT_MS);
      return () => {
        cancelled = true;
        clearTimeout(t);
        clearInterval(frames);
        sides.dispose();
      };
    }

    let stream: MediaStream | null = null;
    let raf = 0;
    let front: { bitmap: ImageBitmap; quality: Record<string, number> } | null = null;
    const stop = () => stream?.getTracks().forEach((t) => t.stop());
    const fail = (kind: NonNullable<FlowState["problem"]>) => !cancelled && dispatch({ type: "problem", kind });

    const sides = sideRunner({
      takePhoto: () => {
        const video = videoRef.current;
        if (!video) return Promise.reject(new Error("no video"));
        return captureBurst(video, SIDE.frames).then((r) => r.bitmap);
      },
      show,
      finish: (photos) => {
        cancelAnimationFrame(raf);
        stop();
        if (cancelled || !front) {
          photos.left?.close();
          photos.right?.close();
          return;
        }
        hand({ ...front, sides: photos });
      },
    });
    skipRef.current = () => sides.skip();

    (async () => {
      const ua = navigator.userAgent;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        fail(cameraErrorKind(new TypeError("no getUserMedia"), ua, window.isSecureContext));
        return;
      }
      const request = navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      try {
        stream = await withTimeout(request, CAMERA_TIMEOUT_MS);
      } catch (err) {
        // If the camera starts after we gave up, switch it straight off again.
        request.then((late) => late.getTracks().forEach((t) => t.stop())).catch(() => {});
        fail(cameraErrorKind(err, ua, true));
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) return stop();
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay of a muted inline video is allowed; ignore odd rejections.
      }

      let landmarker;
      try {
        landmarker = await withTimeout(loadLandmarker("VIDEO"), MODEL_TIMEOUT_MS);
      } catch {
        stop();
        fail("model");
        return;
      }
      if (cancelled) return stop();
      setReady(true);

      let prev: ReturnType<typeof liveQuality>["landmarks"] = null;
      let okSince: number | null = null;
      let last = 0;
      let busy = false;
      const tick = (now: number) => {
        if (cancelled) return;
        raf = requestAnimationFrame(tick);
        if (busy || sides.busy || now - last < 66 || video.readyState < 2) return;
        last = now;
        let r: ReturnType<typeof liveQuality>;
        try {
          r = liveQuality(video, landmarker, prev, now);
        } catch {
          // The front photo is already good: go on with whatever side photos were taken.
          if (sides.active) return sides.skip();
          // e.g. the graphics context was lost: say so instead of freezing on the last hint.
          cancelAnimationFrame(raf);
          stop();
          fail("model");
          return;
        }
        prev = r.landmarks;

        // After the front photo: the two guided side photos.
        if (sides.active) {
          sides.sample({ faces: r.faces, yaw: r.metrics.yaw, light: r.light, motion: r.metrics.motion }, now);
          return;
        }

        if (r.hint !== "ok") {
          okSince = null;
          show({ hint: r.hint, hold: 0 });
          return;
        }
        okSince ??= now;
        show({ hint: r.hint, hold: Math.min(1, (now - okSince) / HOLD_MS) });
        if (now - okSince < HOLD_MS) return;
        busy = true;
        show({ capturing: true });
        captureBurst(video)
          .then(({ bitmap, sharpness }) => {
            if (cancelled) return bitmap.close();
            front = {
              bitmap,
              quality: { sharpness, faceWidth: r.metrics.faceWidth, light: r.metrics.light, yaw: r.metrics.yaw },
            };
            busy = false;
            prev = null;
            sides.start(performance.now());
          })
          .catch(() => {
            // The camera stopped mid-capture: show the problem screen with a retry, never a frozen "Scanning".
            busy = false;
            okSince = null;
            show({ capturing: false, hold: 0 });
            cancelAnimationFrame(raf);
            stop();
            fail("unknown");
          });
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stop();
      sides.dispose();
      if (!handedOver) front?.bitmap.close();
    };
  }, [attempt, state.demo, dispatch]);

  if (state.problem) {
    return (
      <CameraProblem
        kind={state.problem}
        onRetry={() => {
          dispatch({ type: "problem", kind: null });
          setReady(false);
          setView(START);
          setAttempt((n) => n + 1);
        }}
        onBack={() => dispatch({ type: "go", step: "tips", dir: -1 })}
      />
    );
  }

  const isReady = ready || state.demo;
  const side = view.phase !== "front" ? view.phase : null;
  const frontHint: Hint = state.demo ? "ok" : view.hint;
  const message = view.capturing
    ? M.camera.scanning
    : !isReady
      ? M.camera.preparing
      : side
        ? sideMessage(side, view.sideHint)
        : M.camera.hints[frontHint];
  const good = view.capturing || (side ? view.sideHint === "hold" : frontHint === "ok");

  return (
    // Full white: the screen itself is the light on the face.
    <div className="flex min-h-dvh flex-col bg-flash pt-[env(safe-area-inset-top)]">
      <div className="px-3 pt-2">
        <Button variant="quiet" onClick={() => dispatch({ type: "go", step: "tips", dir: -1 })}>
          <ArrowLeft size={18} weight="bold" aria-hidden />
          {M.camera.back}
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
        <div
          className={`relative aspect-[3/4] w-[min(74vw,330px)] overflow-hidden rounded-[50%] bg-strip ring-4 ring-offset-4 ring-offset-flash transition-[box-shadow] duration-300 ${
            good ? "ring-cap" : "ring-rule"
          }`}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-full w-full -scale-x-100 object-cover"
            aria-label="Camera preview"
          />
          {!isReady && <div className="absolute inset-0 animate-pulse bg-strip" />}
        </div>

        <div className="mt-9 flex h-[4.5rem] w-full max-w-[340px] items-start justify-center" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={message}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, ...(reduce ? {} : { y: -6 }), transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="type-display text-center text-[25px]"
            >
              {message}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Hold indicator: four pads fill while the face holds still (front, then each side). */}
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="block h-1.5 w-8 rounded-full transition-colors duration-150"
              style={{ backgroundColor: view.capturing || view.hold > (i + 0.5) / 4 ? "var(--cap)" : "var(--rule)" }}
            />
          ))}
        </div>

        {/* Space kept even before the side steps, so the oval does not jump when the button appears. */}
        <div className="mt-4 flex h-11 items-center justify-center">
          {side && (
            <Button variant="quiet" onClick={() => skipRef.current()}>
              {M.camera.sides.skip}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
