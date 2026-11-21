"use client";

import { createContext, useContext, type Dispatch } from "react";
import { DEMO_READINGS, DEMO_TONE } from "@/lib/demo";
import { WORST_READINGS, type DataVariant } from "@/lib/dev/data-variant";
import type { AiErrorCode, AiOutcome, AiResult } from "@/lib/ai/types";
import type { CameraProblemKind } from "@/lib/env/camera-support";
import type { QuizAnswers } from "@/lib/rules/types";
import type { FrameAnalysis, SidePhotos } from "@/lib/vision/analyze-frame";

export type Step = "welcome" | "tips" | "camera" | "analyzing" | "quiz" | "report" | "order" | "done";
export type Analysis = Extract<FrameAnalysis, { ok: true }>;
export type Captured = {
  bitmap: ImageBitmap | null;
  quality: Record<string, number>;
  /** Guided side photos, when taken. Labels follow the ASSUMPTION in lib/analysis/sides.ts. */
  sides: SidePhotos<ImageBitmap>;
};

/** Frees the captured frames. Safe to call twice (close() is idempotent). */
function closeCaptured(c: Captured | null) {
  c?.bitmap?.close();
  c?.sides.left?.close();
  c?.sides.right?.close();
}

export type FlowState = {
  step: Step;
  /** 1 = forward, -1 = back; drives the slide direction. */
  dir: 1 | -1;
  captured: Captured | null;
  analysis: Analysis | null;
  quiz: QuizAnswers | null;
  scanId: string | null;
  problem: CameraProblemKind | "model" | null;
  orderId: string | null;
  demo: boolean;
  debug: boolean;
  /** Dev-only break-ui data variant. Always "demo" in production. */
  data: DataVariant;
  /** The person chose the AI check (photo sent for acne, wrinkles, pores). */
  aiConsent: boolean;
  ai: AiState;
};

export type AiState =
  | { status: "off" }
  | { status: "pending"; token: number }
  | { status: "done"; result: AiResult }
  | { status: "failed"; error: AiErrorCode };

export type FlowAction =
  | { type: "go"; step: Step; dir?: 1 | -1 }
  | { type: "captured"; captured: Captured }
  | { type: "analyzed"; analysis: Analysis }
  | { type: "quizDone"; quiz: QuizAnswers; scanId: string }
  | { type: "problem"; kind: FlowState["problem"] }
  | { type: "ordered"; id: string }
  | { type: "retake" }
  | { type: "flags"; demo: boolean; debug: boolean; data: DataVariant }
  | { type: "data"; data: DataVariant }
  | { type: "aiConsent"; consent: boolean }
  | { type: "aiStart"; token: number }
  | { type: "aiDone"; token: number; outcome: AiOutcome };

export const initialFlow: FlowState = {
  step: "welcome",
  dir: 1,
  captured: null,
  analysis: null,
  quiz: null,
  scanId: null,
  problem: null,
  orderId: null,
  demo: false,
  debug: false,
  data: "demo",
  aiConsent: false,
  ai: { status: "off" },
};

export function flowReducer(s: FlowState, a: FlowAction): FlowState {
  switch (a.type) {
    case "go":
      return { ...s, step: a.step, dir: a.dir ?? 1, problem: a.step === "camera" ? null : s.problem };
    case "captured":
      if (s.captured !== a.captured) closeCaptured(s.captured);
      return { ...s, captured: a.captured, step: "analyzing", dir: 1 };
    case "analyzed":
      // The frames are not needed once read. The object stays, so effects keyed on it do not re-run.
      closeCaptured(s.captured);
      return { ...s, analysis: a.analysis, step: "quiz", dir: 1 };
    case "quizDone":
      return { ...s, quiz: a.quiz, scanId: a.scanId, step: "report", dir: 1 };
    case "problem":
      return { ...s, problem: a.kind };
    case "ordered":
      return { ...s, orderId: a.id, step: "done", dir: 1 };
    case "retake":
      if (s.analysis?.photoUrl) URL.revokeObjectURL(s.analysis.photoUrl);
      closeCaptured(s.captured);
      return { ...s, captured: null, analysis: null, scanId: null, orderId: null, ai: { status: "off" }, step: "camera", dir: -1 };
    case "aiConsent":
      return { ...s, aiConsent: a.consent };
    case "aiStart":
      return { ...s, ai: { status: "pending", token: a.token } };
    case "aiDone":
      // A result for an earlier scan (before a retake) is dropped.
      if (s.ai.status !== "pending" || s.ai.token !== a.token) return s;
      return { ...s, ai: a.outcome.ok ? { status: "done", result: a.outcome.result } : { status: "failed", error: a.outcome.error } };
    case "flags":
      return { ...s, demo: a.demo, debug: a.debug, data: a.data };
    case "data": {
      if (!s.demo || !s.analysis) return { ...s, data: a.data };
      const worst = a.data === "worst";
      const analysis = {
        ...s.analysis,
        readings: worst ? WORST_READINGS : DEMO_READINGS,
        tone: worst ? { ita: -41.5, category: "dark" as const } : DEMO_TONE,
      };
      return { ...s, data: a.data, analysis };
    }
  }
}

export const FlowContext = createContext<{ state: FlowState; dispatch: Dispatch<FlowAction> } | null>(null);

export function useFlow() {
  const ctx = useContext(FlowContext);
  if (!ctx) throw new Error("useFlow outside FlowContext");
  return ctx;
}
