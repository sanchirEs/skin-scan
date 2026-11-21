"use client";

import { motion, useReducedMotion } from "motion/react";
import { mixRamp } from "./colors";

export type Pad = { id: string; intensity: number; label: string; sublabel?: string; ramp: [string, string] };

/**
 * The reagent strip: four square pads on a white plastic strip. With `develop`,
 * each pad fills from blank to its reading colour in turn, the signature moment.
 */
export function Strip({
  pads,
  develop = false,
  selected,
  onSelect,
  pending = false,
}: {
  pads: Pad[];
  develop?: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  pending?: boolean;
}) {
  const reduce = useReducedMotion();
  return (
    <div className="rounded-[var(--radius-strip)] bg-flash p-3 shadow-[0_1px_0_var(--rule),0_10px_30px_-18px_rgb(21_25_27/0.35)] ring-1 ring-rule">
      <div className="grid grid-cols-4 gap-2.5">
        {pads.map((pad, i) => {
          const color = mixRamp(pad.ramp, pad.intensity / 100);
          const isSelected = selected === pad.id;
          const swatch = pending ? (
            <motion.span
              className="block aspect-square w-full rounded-[var(--radius-pad)] bg-rule/60"
              animate={reduce ? undefined : { opacity: [0.45, 0.9, 0.45] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
            />
          ) : (
            <motion.span
              className="block aspect-square w-full rounded-[var(--radius-pad)] ring-1 ring-inset ring-black/5"
              initial={develop && !reduce ? { backgroundColor: "#ffffff" } : false}
              animate={{ backgroundColor: color }}
              transition={{ duration: 0.7, delay: develop ? 0.25 + i * 0.14 : 0, ease: [0.16, 1, 0.3, 1] }}
              style={{ backgroundColor: develop && !reduce ? undefined : color }}
            />
          );
          const label = (
            <span
              className={`mt-2 block text-center text-[12.5px] leading-tight ${
                isSelected ? "font-semibold text-ink" : "text-ink-soft"
              }`}
            >
              {pad.label}
              {pad.sublabel && (
                <span className="mt-0.5 block text-[12.5px] font-semibold text-ink">{pad.sublabel}</span>
              )}
            </span>
          );
          return onSelect ? (
            <button
              key={pad.id}
              type="button"
              onClick={() => onSelect(pad.id)}
              aria-pressed={isSelected}
              className={`rounded-[6px] p-1 transition-[background-color,box-shadow] duration-200 ${
                isSelected ? "bg-strip ring-2 ring-cap" : "hover:bg-strip"
              }`}
            >
              {swatch}
              {label}
            </button>
          ) : (
            <div key={pad.id} className="p-1">
              {swatch}
              {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
