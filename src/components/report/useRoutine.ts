"use client";

import { useMemo } from "react";
import { catalogFor } from "@/lib/dev/data-variant";
import { deriveConcerns } from "@/lib/rules/concerns";
import { buildRoutine } from "@/lib/rules/routine";
import type { Product } from "@/lib/rules/types";
import { useFlow } from "../flow/flow";

/** Concerns, routine and the distinct recommended products for the current reading. */
export function useRoutine() {
  const { state } = useFlow();
  return useMemo(() => {
    if (!state.analysis || !state.quiz) return null;
    const concerns = deriveConcerns(state.analysis.readings, state.quiz);
    const routine = buildRoutine(concerns, state.quiz, catalogFor(state.data));
    const products: Product[] = [];
    for (const s of routine.slots) if (s.product && !products.some((p) => p.id === s.product!.id)) products.push(s.product);
    return { concerns, routine, products };
  }, [state.analysis, state.quiz, state.data]);
}
