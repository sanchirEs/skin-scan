import type { Concern, ConcernId, Level, Region } from "./types.js";

/** Round a health score into 1..100. */
export function clampScore(value: number): number {
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function levelFor(severity: number): Level {
  if (severity < 20) return "none";
  if (severity < 45) return "mild";
  if (severity < 70) return "moderate";
  return "high";
}

/** Build a concern from a health score (higher = healthier). Providers must convert to that scale first. */
export function makeConcern(
  id: ConcernId,
  healthScore: number,
  maskUrl: string | null = null,
  regions: Region[] = [],
): Concern {
  const score = clampScore(healthScore);
  const severity = 100 - score;
  return { id, score, severity, level: levelFor(severity), maskUrl, regions };
}
