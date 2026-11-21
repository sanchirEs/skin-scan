import type { AiState } from "@/components/flow/flow";

/** The AI findings as plain numbers for the scan log and orders: never masks or images. */
export function aiNumbers(ai: AiState) {
  if (ai.status !== "done") return undefined;
  return ai.result.concerns.map(({ id, severity, level }) => ({ id, severity, level }));
}
