import type { Slot } from "@/lib/rules/types";

type Kind = "pump" | "dropper" | "jar" | "tube" | "eye";

const KIND: Record<Slot, Kind> = {
  "am-cleanser": "pump",
  "pm-cleanser": "pump",
  "am-serum": "dropper",
  "pm-treatment": "dropper",
  "am-moisturizer": "jar",
  "pm-moisturizer": "jar",
  "am-sunscreen": "tube",
  eye: "eye",
};

/** Soft pairs: tile background, bottle body. One per product, picked from its id. */
const TINTS: [string, string][] = [
  ["#ebe4f5", "#b9a6d9"],
  ["#dcefe6", "#8cc2a9"],
  ["#f5e4dd", "#dca58e"],
  ["#e2e8f5", "#9fb0d6"],
  ["#f3eedb", "#d1bb76"],
  ["#f2e1ea", "#cf98b5"],
];

function tintFor(id: string): [string, string] {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TINTS[h % TINTS.length];
}

const INK = "#2a1c42";

function Shape({ kind, body }: { kind: Kind; body: string }) {
  const line = { stroke: INK, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  switch (kind) {
    case "pump":
      return (
        <g {...line}>
          <path d="M30 10 h10 M35 10 v6" fill="none" />
          <rect x="30" y="16" width="10" height="6" rx="1.5" fill="#fff" />
          <rect x="23" y="22" width="24" height="34" rx="6" fill={body} />
          <path d="M28 34 h14 M28 39 h9" fill="none" opacity="0.55" />
        </g>
      );
    case "dropper":
      return (
        <g {...line}>
          <path d="M32 8 h6 v6 h-6 z" fill="#fff" />
          <rect x="29" y="14" width="12" height="8" rx="2" fill={INK} />
          <path d="M26 26 Q26 22 30 22 h10 Q44 22 44 26 v26 q0 4 -4 4 h-10 q-4 0 -4 -4 z" fill={body} />
          <path d="M30 34 h10" fill="none" opacity="0.55" />
        </g>
      );
    case "jar":
      return (
        <g {...line}>
          <rect x="16" y="24" width="38" height="10" rx="3" fill="#fff" />
          <path d="M18 34 h34 v14 q0 6 -6 6 h-22 q-6 0 -6 -6 z" fill={body} />
          <path d="M26 43 h18" fill="none" opacity="0.55" />
        </g>
      );
    case "tube":
      return (
        <g {...line}>
          <path d="M24 10 h22 l-2 34 h-18 z" fill={body} />
          <rect x="27" y="44" width="16" height="10" rx="2" fill="#fff" />
          <path d="M30 22 h10 M31 27 h8" fill="none" opacity="0.55" />
        </g>
      );
    case "eye":
      return (
        <g {...line}>
          <path d="M28 14 h14 l-2 28 h-10 z" fill={body} />
          <path d="M31 42 h8 v8 q0 3 -4 3 q-4 0 -4 -3 z" fill="#fff" />
          <path d="M32 24 h6" fill="none" opacity="0.55" />
        </g>
      );
  }
}

/** A drawn stand-in for a product photo, until the brand sends real packshots. */
export function ProductArt({ id, slot, className = "" }: { id: string; slot: Slot; className?: string }) {
  const [bg, body] = tintFor(id);
  return (
    <svg viewBox="0 0 70 64" className={className} aria-hidden>
      <rect width="70" height="64" rx="14" fill={bg} />
      <ellipse cx="35" cy="56" rx="20" ry="2.5" fill={INK} opacity="0.08" />
      <Shape kind={KIND[slot]} body={body} />
    </svg>
  );
}
