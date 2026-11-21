"use client";

import { useEffect } from "react";
import { M } from "@/config/messages";
import { preloadLandmarker } from "@/lib/vision/landmarker";
import { Button } from "../ui/Button";
import { useFlow } from "./flow";

export function Tips() {
  const { state, dispatch } = useFlow();

  // Start fetching the face model while the user reads.
  useEffect(() => {
    if (!state.demo) preloadLandmarker();
  }, [state.demo]);

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col">
      <div className="flex-1 px-5 pt-9">
        <h1 className="type-display text-[30px]">{M.tips.title}</h1>
        <ul className="mt-7 space-y-5">
          {M.tips.items.map((item) => (
            <li key={item} className="flex gap-4 text-[17px] leading-[1.5]">
              <span aria-hidden className="mt-[7px] block h-3 w-3 shrink-0 rounded-[3px] bg-cap" />
              <span className="max-w-[34ch]">{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2 px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))]">
        <p className="mb-1.5 text-[14px] leading-snug text-ink-soft">{M.tips.aiNotice}</p>
        <Button
          className="w-full"
          onClick={() => {
            dispatch({ type: "aiConsent", consent: true });
            dispatch({ type: "go", step: "camera" });
          }}
        >
          {M.tips.startAi}
        </Button>
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => {
            dispatch({ type: "aiConsent", consent: false });
            dispatch({ type: "go", step: "camera" });
          }}
        >
          {M.tips.startLocal}
        </Button>
        <Button variant="quiet" onClick={() => dispatch({ type: "go", step: "welcome", dir: -1 })}>
          {M.tips.back}
        </Button>
      </div>
    </div>
  );
}
