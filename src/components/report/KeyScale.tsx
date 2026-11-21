"use client";

import { motion, useReducedMotion } from "motion/react";
import { M } from "@/config/messages";
import type { Reading } from "@/lib/analysis/types";
import { keyChips } from "../strip/colors";

/** One reading against its printed key: five chips and a mark where this face read. */
export function KeyScale({
  reading,
  active,
  delay = 0,
  onSelect,
}: {
  reading: Reading;
  active: boolean;
  delay?: number;
  onSelect: () => void;
}) {
  const reduce = useReducedMotion();
  const m = M.report.measures[reading.id];
  const chips = keyChips(reading.id);
  const levelWord = reading.id === "shine" && reading.label === "balanced" ? M.report.balanced : M.report.levels[reading.level];

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`block w-full rounded-[var(--radius-card)] px-4 py-4 text-left transition-[background-color,box-shadow] duration-200 ${
        active ? "bg-strip-raised ring-2 ring-cap" : "bg-strip-raised/60 ring-1 ring-rule hover:ring-ink-soft"
      }`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-[17px] font-semibold">{m.name}</span>
        <span className="text-[15px] font-semibold text-ink">{levelWord}</span>
      </span>

      <span className="relative mt-3.5 block py-1.5">
        <span className="grid grid-cols-5 gap-1">
          {chips.map((c, i) => (
            <span key={i} className="block h-5 rounded-[var(--radius-pad)]" style={{ backgroundColor: c }} />
          ))}
        </span>
        {/* The track clips the sliding layer so it can never widen the page. */}
        <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <motion.span
            className="absolute inset-y-0 left-0 block w-full"
            initial={reduce ? false : { x: "0%" }}
            animate={{ x: `${Math.min(99, Math.max(1, reading.intensity))}%` }}
            transition={{ duration: 0.9, delay: reduce ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="absolute -left-[1.5px] inset-y-0 block w-[3px] rounded-full bg-ink shadow-[0_0_0_2px_var(--flash)]" />
          </motion.span>
        </span>
      </span>

      <span className="mt-1 flex justify-between text-[12.5px] text-ink-faint">
        <span>{m.ends[0]}</span>
        <span>{m.ends[1]}</span>
      </span>
      <span className="mt-2.5 block text-[15px] leading-[1.5] text-ink-soft">{m.say[reading.level]}</span>
      {active && <span className="mt-1.5 block text-[13px] text-cap">{m.where}</span>}
    </button>
  );
}
