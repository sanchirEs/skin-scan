import type { QuizAnswers } from "./types";

export const QUIZ_ORDER = ["feel", "breakouts", "stinging", "goals", "age", "pregnant", "sun"] as const satisfies readonly (keyof QuizAnswers)[];

/** The first question without an answer, or null when the quiz is complete. */
export function firstMissing(a: Partial<QuizAnswers>): keyof QuizAnswers | null {
  for (const k of QUIZ_ORDER) {
    if (k === "goals" ? !Array.isArray(a.goals) : a[k] === undefined) return k;
  }
  return null;
}
