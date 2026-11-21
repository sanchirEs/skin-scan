"use client";

import { M } from "@/config/messages";
import type { Reading } from "@/lib/analysis/types";
import { keyChips } from "../strip/colors";
import { KeyCard } from "./KeyCard";

/** An on-phone reading against its key. */
export function KeyScale({ reading, delay = 0, onSelect }: { reading: Reading; delay?: number; onSelect?: () => void }) {
  const m = M.report.measures[reading.id];
  const levelWord = reading.id === "shine" && reading.label === "balanced" ? M.report.balanced : M.report.levels[reading.level];
  return (
    <KeyCard
      name={m.name}
      levelWord={levelWord}
      intensity={reading.intensity}
      chips={keyChips(reading.id)}
      ends={m.ends}
      sentence={m.say[reading.level]}
      where={m.where}
      delay={delay}
      onSelect={onSelect}
    />
  );
}
