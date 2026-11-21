"use client";

import Link from "next/link";
import { M } from "@/config/messages";
import { RAMPS, keyChips } from "../strip/colors";
import { Strip } from "../strip/Strip";
import { Button } from "../ui/Button";
import { useFlow } from "./flow";

// Illustrative values for the example strip; labelled as an example on screen.
const EXAMPLE = (
  [
    ["redness", 38],
    ["evenness", 55],
    ["darkCircles", 24],
    ["shine", 66],
  ] as const
).map(([id, intensity]) => ({ id, intensity, label: M.report.measures[id].name, ramp: RAMPS[id] }));

export function Welcome() {
  const { dispatch } = useFlow();
  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col">
      <div className="flex-1 px-5 pt-9">
        <h1 className="type-display max-w-[13ch] text-[36px]">{M.welcome.title}</h1>
        <p className="mt-4 max-w-[38ch] text-[17px] leading-[1.55] text-ink-soft">{M.welcome.body}</p>

        <figure className="mt-9">
          <Strip pads={EXAMPLE} />
          <div className="mt-5 px-1" aria-hidden>
            <div className="relative py-1.5">
              <div className="grid grid-cols-5 gap-1">
                {keyChips("redness").map((c, i) => (
                  <span key={i} className="block h-4 rounded-[var(--radius-pad)]" style={{ backgroundColor: c }} />
                ))}
              </div>
              <span
                className="absolute inset-y-0 block w-[3px] -translate-x-1/2 rounded-full bg-ink shadow-[0_0_0_2px_var(--flash)]"
                style={{ left: `${EXAMPLE[0].intensity}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-[12.5px] text-ink-faint">
              <span>{M.report.measures.redness.ends[0]}</span>
              <span>{M.report.measures.redness.ends[1]}</span>
            </div>
          </div>
          <figcaption className="mt-3 max-w-[40ch] text-[14px] leading-snug text-ink-soft">
            {M.welcome.keyNote} <span className="text-ink-faint">{M.welcome.example}</span>
          </figcaption>
        </figure>
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-strip from-70% to-transparent px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))]">
        <Button className="w-full" onClick={() => dispatch({ type: "go", step: "tips" })}>
          {M.welcome.start}
        </Button>
        <p className="mt-3 text-center text-[13px] leading-snug text-ink-soft">
          {M.welcome.notice}{" "}
          <Link href="/privacy" className="text-cap underline">
            {M.welcome.privacy}
          </Link>
        </p>
      </div>
    </div>
  );
}
