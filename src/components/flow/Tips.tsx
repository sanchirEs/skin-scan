"use client";

import { ArrowLeft, DeviceMobile, Eyeglasses, LockSimple, Sparkle, SunHorizon, UserFocus } from "@phosphor-icons/react/dist/ssr";
import { useEffect } from "react";
import { M } from "@/config/messages";
import { preloadLandmarker } from "@/lib/vision/landmarker";
import { Button } from "../ui/Button";
import { useFlow } from "./flow";

const TIP_ICONS = [Eyeglasses, UserFocus, SunHorizon, DeviceMobile];

export function Tips() {
  const { state, dispatch } = useFlow();

  // Start fetching the face model while the user reads.
  useEffect(() => {
    if (!state.demo) preloadLandmarker();
  }, [state.demo]);

  const start = (consent: boolean) => {
    dispatch({ type: "aiConsent", consent });
    dispatch({ type: "go", step: "camera" });
  };

  const choices = [
    { consent: true, Icon: Sparkle, title: M.tips.startAi, note: M.tips.startAiNote, primary: true },
    { consent: false, Icon: LockSimple, title: M.tips.startLocal, note: M.tips.startLocalNote, primary: false },
  ];

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col px-5 pt-4 pb-[max(20px,env(safe-area-inset-bottom))]">
      <Button variant="quiet" className="-ml-3 self-start" onClick={() => dispatch({ type: "go", step: "welcome", dir: -1 })}>
        <ArrowLeft size={18} weight="bold" aria-hidden />
        {M.tips.back}
      </Button>
      <h1 className="type-display mt-2 text-[34px]">{M.tips.title}</h1>

      <ul className="mt-6 grid grid-cols-2 gap-2.5">
        {M.tips.items.map((item, i) => {
          const Icon = TIP_ICONS[i];
          return (
            <li key={item} className="rounded-[var(--radius-card)] bg-strip-raised p-4 lift">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-cap-tint text-cap">
                <Icon size={22} weight="duotone" aria-hidden />
              </span>
              <span className="mt-3 block text-[15px] leading-[1.4]">{item}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto pt-8">
        <h2 className="type-display text-[22px]">{M.tips.choose}</h2>
        <div className="mt-3 grid gap-2.5">
          {choices.map(({ consent, Icon, title, note, primary }) => (
            <button
              key={title}
              type="button"
              onClick={() => start(consent)}
              className={`flex items-center gap-3.5 rounded-[var(--radius-card)] px-4 py-3.5 text-left transition-[transform,background-color] duration-150 active:scale-[0.98] ${
                primary ? "bg-cap text-cap-ink hover:bg-cap-deep" : "bg-strip-raised text-ink ring-1 ring-rule hover:ring-ink-faint"
              }`}
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full ${primary ? "bg-white/12" : "bg-cap-tint text-cap"}`}
              >
                <Icon size={22} weight={primary ? "fill" : "duotone"} aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-[17px] font-semibold">{title}</span>
                <span className={`block text-[14px] ${primary ? "text-cap-ink/75" : "text-ink-soft"}`}>{note}</span>
              </span>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] leading-snug text-ink-faint">{M.tips.aiNotice}</p>
      </div>
    </div>
  );
}
