"use client";

import { useEffect, useRef } from "react";
import type { Mask, Pt } from "@/lib/analysis/geometry";
import type { MeasureId } from "@/lib/analysis/types";
import type { ZoneId } from "@/lib/analysis/zones";
import { RAMPS } from "../strip/colors";

export const ZONES_FOR: Record<MeasureId, ZoneId[]> = {
  redness: ["cheekL", "cheekR", "nose"],
  evenness: ["cheekL", "cheekR", "forehead"],
  darkCircles: ["underEyeL", "underEyeR"],
  shine: ["forehead", "nose"],
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The captured photo with the zones that produced a reading drawn over it. Mirrored like a mirror. */
export function ZoneOverlay({
  photoUrl,
  zones,
  size,
  measure,
  show,
  spots,
}: {
  photoUrl: string;
  zones: Record<ZoneId, Mask>;
  size: { w: number; h: number };
  measure: MeasureId;
  show: boolean;
  spots: Pt[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const { w, h } = size;
    const img = ctx.createImageData(w, h);
    const [r, g, b] = rgb(RAMPS[measure][1]);
    for (const id of ZONES_FOR[measure]) {
      const m = zones[id].data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!m[i]) continue;
          const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1 || !m[i - 1] || !m[i + 1] || !m[i - w] || !m[i + w];
          img.data[i * 4] = edge ? 255 : r;
          img.data[i * 4 + 1] = edge ? 255 : g;
          img.data[i * 4 + 2] = edge ? 255 : b;
          img.data[i * 4 + 3] = edge ? 235 : 55;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    if (measure === "evenness") {
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      for (const s of spots) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, 5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }, [zones, size, measure, spots]);

  return (
    <div
      className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-[var(--radius-card)] bg-strip ring-1 ring-rule"
      style={{ aspectRatio: `${size.w} / ${size.h}` }}
    >
      <div className="absolute inset-0 -scale-x-100">
        {/* eslint-disable-next-line @next/next/no-img-element -- local object URL, never uploaded */}
        <img src={photoUrl} alt="Your scan, shown as in a mirror" className="h-full w-full object-cover" />
        <canvas
          ref={canvasRef}
          width={size.w}
          height={size.h}
          aria-hidden
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${show ? "opacity-100" : "opacity-0"}`}
        />
      </div>
    </div>
  );
}
