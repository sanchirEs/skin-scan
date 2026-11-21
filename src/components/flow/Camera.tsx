"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { M } from "@/config/messages";
import type { Hint } from "@/lib/analysis/quality";
import { cameraErrorKind } from "@/lib/env/camera-support";
import { captureBurst, liveQuality } from "@/lib/vision/capture";
import { loadLandmarker } from "@/lib/vision/landmarker";
import { withTimeout } from "@/lib/timeout";
import { Button } from "../ui/Button";
import { CameraProblem } from "./CameraProblem";
import { useFlow, type FlowState } from "./flow";

const HOLD_MS = 1000;
/** A permission prompt or camera start that hangs (some in-app browsers) gives up here. */
const CAMERA_TIMEOUT_MS = 20_000;
/** About 18 MB of model and runtime on a slow phone connection. */
const MODEL_TIMEOUT_MS = 30_000;

export function Camera() {
  const { state, dispatch } = useFlow();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState<Hint>("no-face");
  const [hold, setHold] = useState(0);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (state.demo) {
      const t = setTimeout(() => dispatch({ type: "captured", captured: { bitmap: null, quality: {} } }), 1600);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let raf = 0;
    const stop = () => stream?.getTracks().forEach((t) => t.stop());
    const fail = (kind: NonNullable<FlowState["problem"]>) => !cancelled && dispatch({ type: "problem", kind });

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
        if (busy || now - last < 66 || video.readyState < 2) return;
        last = now;
        let r: ReturnType<typeof liveQuality>;
        try {
          r = liveQuality(video, landmarker, prev, now);
        } catch {
          // e.g. the graphics context was lost: say so instead of freezing on the last hint.
          cancelAnimationFrame(raf);
          stop();
          fail("model");
          return;
        }
        prev = r.landmarks;
        setHint(r.hint);
        if (r.hint !== "ok") {
          okSince = null;
          setHold(0);
          return;
        }
        okSince ??= now;
        setHold(Math.min(1, (now - okSince) / HOLD_MS));
        if (now - okSince < HOLD_MS) return;
        busy = true;
        setCapturing(true);
        captureBurst(video)
          .then(({ bitmap, sharpness }) => {
            stop();
            if (cancelled) return bitmap.close();
            dispatch({
              type: "captured",
              captured: {
                bitmap,
                quality: { sharpness, faceWidth: r.metrics.faceWidth, light: r.metrics.light, yaw: r.metrics.yaw },
              },
            });
          })
          .catch(() => {
            // The camera stopped mid-capture: show the problem screen with a retry, never a frozen "Scanning".
            busy = false;
            okSince = null;
            setCapturing(false);
            setHold(0);
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
    };
  }, [attempt, state.demo, dispatch]);

  if (state.problem) {
    return (
      <CameraProblem
        kind={state.problem}
        onRetry={() => {
          dispatch({ type: "problem", kind: null });
          setReady(false);
          setAttempt((n) => n + 1);
        }}
        onBack={() => dispatch({ type: "go", step: "tips", dir: -1 })}
      />
    );
  }

  const isReady = ready || state.demo;
  const shownHint: Hint = state.demo ? "ok" : hint;
  const message = capturing ? M.camera.scanning : isReady ? M.camera.hints[shownHint] : M.camera.preparing;
  const good = shownHint === "ok" || capturing;

  return (
    // Full white: the screen itself is the light on the face.
    <div className="flex min-h-dvh flex-col bg-flash pt-[env(safe-area-inset-top)]">
      <div className="px-3 pt-2">
        <Button variant="quiet" onClick={() => dispatch({ type: "go", step: "tips", dir: -1 })}>
          {M.camera.back}
        </Button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10">
        <div
          className={`relative aspect-[3/4] w-[min(74vw,330px)] overflow-hidden rounded-[50%] bg-strip ring-[3px] transition-[box-shadow] duration-300 ${
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
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12, ease: [0.4, 0, 1, 1] } }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="type-display text-center text-[25px]"
            >
              {message}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* Hold indicator: four pads fill while the face holds still. */}
        <div className="mt-3 flex gap-1.5" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className="block h-2.5 w-7 rounded-[3px] transition-colors duration-150"
              style={{ backgroundColor: capturing || hold > (i + 0.5) / 4 ? "var(--cap)" : "var(--rule)" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
