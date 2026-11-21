import type { AiConcern } from "../ai/types";
import type { Level, Reading } from "../analysis/types";
import { CONCERN_ORDER, type Concern, type ConcernId, type QuizAnswers } from "./types";

const RANK: Record<Level, number> = { none: 0, mild: 1, moderate: 2, high: 3 };
const LEVELS: Level[] = ["none", "mild", "moderate", "high"];
const max = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);
const step = (l: Level): Level => LEVELS[Math.min(3, RANK[l] + 1)];

export const levelRank = (l: Level) => RANK[l];

/**
 * Concerns from the on-phone readings, the AI check (when the person chose it)
 * and the quiz. A camera finding and an answer about the same thing combine.
 */
export function deriveConcerns(readings: Reading[], q: QuizAnswers, ai: AiConcern[] = []): Concern[] {
  const reading = (id: Reading["id"]) => readings.find((r) => r.id === id);
  const aiFound = (id: AiConcern["id"]) => ai.find((c) => c.id === id);
  /** The stronger of an on-phone reading and AI findings for the same concern. */
  const measuredLevel = (...found: ({ level: Level; intensity?: number; severity?: number } | undefined)[]) => {
    let level: Level = "none";
    let intensity: number | undefined;
    for (const f of found) {
      if (!f || RANK[f.level] <= RANK[level]) continue;
      level = f.level;
      intensity = f.intensity ?? f.severity;
    }
    return { level, intensity };
  };
  const out: Concern[] = [];

  const add = (id: ConcernId, measured: Level, answered: Level, intensity?: number) => {
    const level = max(measured, answered);
    if (level === "none") return;
    const source = measured !== "none" && answered !== "none" ? "both" : measured !== "none" ? "measured" : "answers";
    out.push({ id, level, source, ...(measured !== "none" && intensity !== undefined ? { intensity } : {}) });
  };

  const goal = (g: QuizAnswers["goals"][number]) => q.goals.includes(g);
  const feelOil: Level = q.feel === "oily" ? "moderate" : q.feel === "t-zone" ? "mild" : "none";
  const oil = measuredLevel(reading("shine"), aiFound("oiliness"), aiFound("pores"));
  add("oiliness", oil.level, feelOil, oil.intensity);

  const breakouts: Record<QuizAnswers["breakouts"], Level> = {
    rarely: "none",
    sometimes: "mild",
    often: "moderate",
    painful: "high",
  };
  const acne = measuredLevel(aiFound("acne"));
  add("breakouts", acne.level, max(breakouts[q.breakouts], goal("clear") ? "mild" : "none"), acne.intensity);

  const measuredWithGoal = (
    id: ConcernId,
    g: QuizAnswers["goals"][number],
    ...found: ({ level: Level; intensity?: number; severity?: number } | undefined)[]
  ) => {
    const m = measuredLevel(...found);
    add(id, m.level, goal(g) ? "mild" : "none", m.intensity);
  };
  measuredWithGoal("redness", "calm", reading("redness"), aiFound("redness"));
  measuredWithGoal("uneven", "even", reading("evenness"), aiFound("texture"), aiFound("spots"));
  measuredWithGoal("darkCircles", "eyes", reading("darkCircles"), aiFound("darkCircles"));

  add("dryness", "none", q.feel === "dry" ? "moderate" : goal("hydrate") ? "mild" : "none");

  const sensitivity: Record<QuizAnswers["stinging"], Level> = { no: "none", sometimes: "mild", often: "high" };
  add("sensitivity", "none", sensitivity[q.stinging]);

  const older = q.age === "40-49" || q.age === "50+";
  let aging: Level = goal("firm") ? "mild" : "none";
  if (older) aging = aging === "none" ? "mild" : step(aging);
  const wrinkles = measuredLevel(aiFound("wrinkles"), aiFound("firmness"));
  add("aging", wrinkles.level, aging, wrinkles.intensity);

  return out.sort(
    (a, b) => RANK[b.level] - RANK[a.level] || CONCERN_ORDER.indexOf(a.id) - CONCERN_ORDER.indexOf(b.id),
  );
}
