"use client";

import { MapPin } from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** The selected finding in full: the photo, its key with a mark where this face read, and what it means. */
export function KeyCard({
  name,
  levelWord,
  intensity,
  chips,
  ends,
  sentence,
  where,
  delay = 0,
  media,
}: {
  name: string;
  levelWord: string;
  intensity: number;
  chips: string[];
  ends: readonly [string, string];
  sentence: string;
  where?: string;
  delay?: number;
  media?: ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <section className="overflow-hidden rounded-[var(--radius-strip)] bg-strip-raised lift" aria-live="polite">
      {media}
      <div className="px-4 pt-4 pb-5">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="type-display text-[24px]">{name}</h3>
          <span className="rounded-full bg-strip px-2.5 py-1 text-[13px] font-semibold">{levelWord}</span>
        </div>

        <div className="relative mt-5 py-2.5">
          <div className="grid grid-cols-5 gap-1">
            {chips.map((c, i) => (
              <span
                key={i}
                className={`block h-3 ${i === 0 ? "rounded-l-full" : ""} ${i === 4 ? "rounded-r-full" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          {/* The track clips the sliding layer so it can never widen the page. */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 w-full"
              initial={reduce ? false : { x: "0%" }}
              animate={{ x: `${Math.min(96, Math.max(4, intensity))}%` }}
              transition={{ duration: 0.9, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="absolute top-1/2 -left-[11px] block h-[22px] w-[22px] -translate-y-1/2 rounded-full border-[5px] border-ink bg-strip-raised shadow-[0_2px_6px_rgb(26_22_37/0.3)]" />
            </motion.div>
          </div>
        </div>
        <div className="mt-1.5 flex justify-between text-[12.5px] text-ink-faint">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>

        <p className="mt-3.5 text-[16px] leading-[1.5]">{sentence}</p>
        {where && (
          <p className="mt-2 flex items-center gap-1.5 text-[13.5px] text-ink-soft">
            <MapPin size={15} weight="fill" className="text-cap" aria-hidden />
            {where}
          </p>
        )}
      </div>
    </section>
  );
}
