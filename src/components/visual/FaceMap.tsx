"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { ZoneId } from "@/lib/analysis/zones";

/** Zone shapes on a 160 x 200 drawn face. Left/right as seen in a mirror. */
const ZONE_SHAPES: Record<ZoneId, { cx: number; cy: number; rx: number; ry: number }> = {
  forehead: { cx: 80, cy: 50, rx: 34, ry: 15 },
  underEyeL: { cx: 59, cy: 99, rx: 11, ry: 4.5 },
  underEyeR: { cx: 101, cy: 99, rx: 11, ry: 4.5 },
  cheekL: { cx: 49, cy: 123, rx: 14, ry: 17 },
  cheekR: { cx: 111, cy: 123, rx: 14, ry: 17 },
  nose: { cx: 80, cy: 112, rx: 8, ry: 17 },
  chin: { cx: 80, cy: 166, rx: 16, ry: 8 },
};

export type FaceZoneFill = { zones: ZoneId[]; color: string; strength?: number };

const FACE = "M80 14 C117 14 138 43 138 87 C138 129 120 163 97 179 C88 185 72 185 63 179 C40 163 22 129 22 87 C22 43 43 14 80 14 Z";

function Features({ stroke }: { stroke: string }) {
  return (
    <g fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 84 C14 82 12 96 16 106 C18 112 22 114 25 113" />
      <path d="M137 84 C146 82 148 96 144 106 C142 112 138 114 135 113" />
      <path d="M45 75 Q57 68 70 73" />
      <path d="M90 73 Q103 68 115 75" />
      <path d="M48 88 Q59 81 70 88 Q59 93 48 88 Z" />
      <path d="M90 88 Q101 81 112 88 Q101 93 90 88 Z" />
      <path d="M79 94 C77 107 72 117 74 123 Q80 127 87 123" />
      <path d="M65 146 Q80 140 95 146 Q80 156 65 146 Z" />
    </g>
  );
}

/**
 * A drawn face with the zones a reading comes from tinted in. Used as the
 * emblem for every measure, so people see where on the face it was read.
 */
export function FaceMap({
  fills,
  className = "",
  outline = "var(--ink)",
  skin = "var(--flash)",
  stagger = false,
  scanning = false,
  title,
}: {
  fills: FaceZoneFill[];
  className?: string;
  outline?: string;
  skin?: string;
  /** Fade each fill in after the last: the one load moment on the welcome screen. */
  stagger?: boolean;
  /** A light band sweeping down the face while the scan is read. */
  scanning?: boolean;
  title?: string;
}) {
  const reduce = useReducedMotion();
  const clip = `face${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 160 200" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={clip}>
          <path d={FACE} />
        </clipPath>
        <linearGradient id={`${clip}-sweep`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--cap)" stopOpacity="0" />
          <stop offset="0.85" stopColor="var(--cap)" stopOpacity="0.22" />
          <stop offset="1" stopColor="var(--cap)" stopOpacity="0.7" />
        </linearGradient>
      </defs>
      <path d={FACE} fill={skin} />
      <g clipPath={`url(#${clip})`}>
        {fills.map((f, fi) =>
          f.zones.map((z) => {
            const s = ZONE_SHAPES[z];
            const k = f.strength ?? 0.75;
            return (
              <motion.ellipse
                key={`${fi}-${z}`}
                {...s}
                fill={f.color}
                stroke={f.color}
                strokeWidth={1.2}
                fillOpacity={0.15 + 0.5 * k}
                strokeOpacity={0.9}
                initial={stagger && !reduce ? { opacity: 0, scale: 0.6 } : false}
                animate={{ opacity: 1, scale: 1 }}
                style={{ transformOrigin: `${s.cx}px ${s.cy}px`, transformBox: "view-box" }}
                transition={{ duration: 0.6, delay: stagger ? 0.35 + fi * 0.22 : 0, ease: [0.16, 1, 0.3, 1] }}
              />
            );
          }),
        )}
        {scanning && !reduce && (
          <motion.rect
            x={0}
            width={160}
            height={46}
            fill={`url(#${clip}-sweep)`}
            initial={{ y: -46 }}
            animate={{ y: [-46, 190] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: [0.45, 0, 0.55, 1] }}
          />
        )}
      </g>
      <Features stroke={outline} />
      <path d={FACE} fill="none" stroke={outline} strokeWidth={1.8} />
    </svg>
  );
}
