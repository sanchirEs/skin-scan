import type { Level, Reading } from "../analysis/types";
import { CONCERN_ORDER, type Concern, type ConcernId, type QuizAnswers } from "./types";

const RANK: Record<Level, number> = { none: 0, mild: 1, moderate: 2, high: 3 };
const LEVELS: Level[] = ["none", "mild", "moderate", "high"];
const max = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);
const step = (l: Level): Level => LEVELS[Math.min(3, RANK[l] + 1)];

export const levelRank = (l: Level) => RANK[l];

export function deriveConcerns(readings: Reading[], q: QuizAnswers): Concern[] {
  const reading = (id: Reading["id"]) => readings.find((r) => r.id === id);
  const out: Concern[] = [];

  const add = (id: ConcernId, measured: Level, answered: Level, intensity?: number) => {
    const level = max(measured, answered);
    if (level === "none") return;
    const source = measured !== "none" && answered !== "none" ? "both" : measured !== "none" ? "measured" : "answers";
    out.push({ id, level, source, ...(measured !== "none" && intensity !== undefined ? { intensity } : {}) });
  };

  const goal = (g: QuizAnswers["goals"][number]) => q.goals.includes(g);
  const shine = reading("shine");
  const feelOil: Level = q.feel === "oily" ? "moderate" : q.feel === "t-zone" ? "mild" : "none";
  add("oiliness", shine?.level ?? "none", feelOil, shine?.intensity);

  const breakouts: Record<QuizAnswers["breakouts"], Level> = {
    rarely: "none",
    sometimes: "mild",
    often: "moderate",
    painful: "high",
  };
  add("breakouts", "none", max(breakouts[q.breakouts], goal("clear") ? "mild" : "none"));

  const measuredWithGoal = (id: ConcernId, readingId: Reading["id"], g: QuizAnswers["goals"][number]) => {
    const r = reading(readingId);
    add(id, r?.level ?? "none", goal(g) ? "mild" : "none", r?.intensity);
  };
  measuredWithGoal("redness", "redness", "calm");
  measuredWithGoal("uneven", "evenness", "even");
  measuredWithGoal("darkCircles", "darkCircles", "eyes");

  add("dryness", "none", q.feel === "dry" ? "moderate" : goal("hydrate") ? "mild" : "none");

  const sensitivity: Record<QuizAnswers["stinging"], Level> = { no: "none", sometimes: "mild", often: "high" };
  add("sensitivity", "none", sensitivity[q.stinging]);

  const older = q.age === "40-49" || q.age === "50+";
  let aging: Level = goal("firm") ? "mild" : "none";
  if (older) aging = aging === "none" ? "mild" : step(aging);
  add("aging", "none", aging);

  return out.sort(
    (a, b) => RANK[b.level] - RANK[a.level] || CONCERN_ORDER.indexOf(a.id) - CONCERN_ORDER.indexOf(b.id),
  );
}
