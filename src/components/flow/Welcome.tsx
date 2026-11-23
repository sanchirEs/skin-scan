"use client";

import { Clock, ShieldCheck, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { M } from "@/config/messages";
import { RAMPS } from "../strip/colors";
import { FaceMap } from "../visual/FaceMap";
import { Button } from "../ui/Button";
import { useFlow } from "./flow";

// Each label sits at the height of the zone it points to (face is 200 units tall).
// One measure per zone here, so colours never mix on the hero.
const CALLOUTS = [
  // reach: how far in from the edge (in % of the figure) the leader line runs, to the zone's centre.
  { id: "shine", side: "left", top: 25, reach: 42, zones: ["forehead", "nose"] },
  { id: "darkCircles", side: "right", top: 49.5, reach: 43, zones: ["underEyeL", "underEyeR"] },
  { id: "redness", side: "left", top: 61.5, reach: 40, zones: ["cheekL"] },
  { id: "evenness", side: "right", top: 64.5, reach: 40, zones: ["cheekR"] },
] as const;

const FACTS = [Clock, ShieldCheck, Sparkle];

export function Welcome() {
  const { dispatch } = useFlow();
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col">
      <div className="flex-1 px-5 pt-6">
        <h1 className="type-display max-w-[12ch] text-[42px]">{M.welcome.title}</h1>
        <p className="mt-4 max-w-[36ch] text-[17px] leading-[1.55] text-ink-soft">{M.welcome.body}</p>

        <figure className="relative mx-auto mt-8 w-full max-w-[380px]">
          <div className="relative mx-auto aspect-[160/200] w-[48%]">
            <div aria-hidden className="absolute -inset-[18%] rounded-full bg-cap-tint/70 blur-2xl" />
            <FaceMap
              className="relative h-full w-full"
              stagger
              fills={CALLOUTS.map((c) => ({ zones: [...c.zones], color: RAMPS[c.id][1], strength: 0.55 }))}
            />
          </div>
          {CALLOUTS.map((c, i) => (
            <motion.span
              key={c.id}
              initial={reduce ? false : { opacity: 0, x: c.side === "left" ? -8 : 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.45 + i * 0.22, ease: [0.16, 1, 0.3, 1] }}
              className={`absolute flex -translate-y-1/2 items-center gap-1.5 text-[13px] font-semibold ${
                c.side === "left" ? "left-0 flex-row-reverse" : "right-0"
              }`}
              style={{ top: `${c.top}%`, width: `${c.reach}%` }}
            >
              <span aria-hidden className={`relative h-px flex-1 bg-ink/45 ${c.side === "left" ? "mr-0" : ""}`}>
                <span
                  className={`absolute top-1/2 block h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-ink ${c.side === "left" ? "-left-0.5" : "-right-0.5"}`}
                />
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-strip-raised py-1 pr-2.5 pl-1.5 lift">
                <span className="block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: RAMPS[c.id][1] }} />
                {M.report.measures[c.id].name}
              </span>
            </motion.span>
          ))}
        </figure>

        <ul className="mt-9 grid gap-3">
          {M.welcome.facts.map((fact, i) => {
            const Icon = FACTS[i];
            return (
              <li key={fact} className="flex items-center gap-3 text-[15px] leading-snug text-ink-soft">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-strip-raised text-cap lift">
                  <Icon size={18} weight="duotone" aria-hidden />
                </span>
                {fact}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="sticky bottom-0 bg-gradient-to-t from-strip from-70% to-transparent px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))]">
        <Button className="w-full" onClick={() => dispatch({ type: "go", step: "tips" })}>
          {M.welcome.start}
        </Button>
        <p className="mt-3 text-center text-[13px] leading-snug text-ink-soft">
          {M.welcome.notice}{" "}
          <Link href="/privacy" className="font-semibold text-cap underline">
            {M.welcome.privacy}
          </Link>
        </p>
      </div>
    </div>
  );
}
