import type { AiConcern } from "../ai/types";
import type { Level } from "../analysis/types";
import { CONCERN_ORDER, type Concern, type ConcernId, type QuizAnswers } from "./types";

const RANK: Record<Level, number> = { none: 0, mild: 1, moderate: 2, high: 3 };
const LEVELS: Level[] = ["none", "mild", "moderate", "high"];
const max = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);
const step = (l: Level): Level => LEVELS[Math.min(3, RANK[l] + 1)];

export const levelRank = (l: Level) => RANK[l];

/**
 * Concerns from the AI check and the quiz. The AI is the only thing that measures skin: the
 * on-phone colour readings were too easily fooled by light and camera to drive the routine.
 * Without the AI check, concerns come from the answers alone. A finding and an answer about
 * the same thing combine; the stronger level wins.
 */
export function deriveConcerns(q: QuizAnswers, ai: AiConcern[] = []): Concern[] {
  const found = (id: AiConcern["id"]) => ai.find((c) => c.id === id);
  /** The strongest of several AI findings that point at one concern. */
  const measured = (...ids: AiConcern["id"][]) => {
    let level: Level = "none";
    let intensity: number | undefined;
    for (const f of ids.map(found)) {
      if (!f || RANK[f.level] <= RANK[level]) continue;
      level = f.level;
      intensity = f.severity;
    }
    return { level, intensity };
  };
  const out: Concern[] = [];

  const add = (id: ConcernId, m: { level: Level; intensity?: number }, answered: Level) => {
    const level = max(m.level, answered);
    if (level === "none") return;
    const source = m.level !== "none" && answered !== "none" ? "both" : m.level !== "none" ? "measured" : "answers";
    out.push({ id, level, source, ...(m.level !== "none" && m.intensity !== undefined ? { intensity: m.intensity } : {}) });
  };

  const goal = (g: QuizAnswers["goals"][number]) => q.goals.includes(g);
  const ifGoal = (g: QuizAnswers["goals"][number]): Level => (goal(g) ? "mild" : "none");

  const feelOil: Level = q.feel === "oily" ? "moderate" : q.feel === "t-zone" ? "mild" : "none";
  add("oiliness", measured("oiliness", "pores"), feelOil);

  const breakouts: Record<QuizAnswers["breakouts"], Level> = {
    rarely: "none",
    sometimes: "mild",
    often: "moderate",
    painful: "high",
  };
  add("breakouts", measured("acne"), max(breakouts[q.breakouts], ifGoal("clear")));

  add("redness", measured("redness"), ifGoal("calm"));
  add("uneven", measured("spots", "texture", "radiance"), ifGoal("even"));
  add("darkCircles", measured("darkCircles", "eyeBags"), ifGoal("eyes"));
  add("dryness", measured("moisture"), q.feel === "dry" ? "moderate" : ifGoal("hydrate"));

  const sensitivity: Record<QuizAnswers["stinging"], Level> = { no: "none", sometimes: "mild", often: "high" };
  add("sensitivity", { level: "none" }, sensitivity[q.stinging]);

  const older = q.age === "40-49" || q.age === "50+";
  let aging: Level = ifGoal("firm");
  if (older) aging = aging === "none" ? "mild" : step(aging);
  add("aging", measured("wrinkles", "firmness"), aging);

  return out.sort(
    (a, b) => RANK[b.level] - RANK[a.level] || CONCERN_ORDER.indexOf(a.id) - CONCERN_ORDER.indexOf(b.id),
  );
}
