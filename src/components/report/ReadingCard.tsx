"use client";

import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import type { ZoneId } from "@/lib/analysis/zones";
import { FaceMap } from "../visual/FaceMap";

/** Filled steps out of five for an intensity of 0..100. */
export const steps = (intensity: number) => (intensity <= 3 ? 0 : Math.min(5, Math.ceil(intensity / 20)));

export function Meter({ intensity, color, className = "" }: { intensity: number; color: string; className?: string }) {
  const on = steps(intensity);
  return (
    <span className={`flex gap-1 ${className}`} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="block h-1.5 flex-1 rounded-full"
          style={{ backgroundColor: i < on ? color : "var(--rule)" }}
        />
      ))}
    </span>
  );
}

/** One finding as a tile: where on the face, what it is, how strong. */
export function ReadingCard({
  name,
  levelWord,
  intensity,
  color,
  zones,
  ai = false,
  selected,
  onSelect,
}: {
  name: string;
  levelWord: string;
  intensity: number;
  color: string;
  zones: ZoneId[];
  ai?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex flex-col rounded-[var(--radius-card)] bg-strip-raised p-3.5 text-left transition-[box-shadow,transform] duration-150 active:scale-[0.98] ${
        selected ? "ring-2 ring-cap" : "lift hover:ring-1 hover:ring-ink-faint"
      }`}
    >
      <span className="flex items-center gap-3">
        <span className="grid h-12 w-10 shrink-0 place-items-center rounded-[10px] bg-strip">
          <FaceMap className="h-10 w-8" fills={[{ zones, color, strength: 0.35 + (0.65 * intensity) / 100 }]} />
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-[15px] font-semibold leading-tight">
            {name}
            {ai && <Sparkle size={13} weight="fill" className="shrink-0 text-cap" aria-label="AI check" />}
          </span>
          <span className="mt-0.5 block text-[13.5px] text-ink-soft">{levelWord}</span>
        </span>
      </span>
      <Meter intensity={intensity} color={color} className="mt-3" />
    </button>
  );
}

/** A tile held for an AI finding that is still on its way. */
export function PendingCard({ name }: { name: string }) {
  return (
    <div className="flex flex-col rounded-[var(--radius-card)] border border-dashed border-ink-faint/40 bg-strip-raised/60 p-3.5">
      <span className="flex items-center gap-3">
        <span className="grid h-12 w-10 shrink-0 place-items-center rounded-[10px] bg-strip">
          <FaceMap className="h-10 w-8" fills={[]} scanning outline="var(--ink-faint)" />
        </span>
        <span>
          <span className="block text-[15px] font-semibold leading-tight text-ink-soft">{name}</span>
          <span className="mt-0.5 block text-[13.5px] text-ink-faint">Checking</span>
        </span>
      </span>
      <span className="mt-3 block h-1.5 animate-pulse rounded-full bg-rule" />
    </div>
  );
}
