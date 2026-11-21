import { describe, expect, it } from "vitest";
import { QUIZ_ORDER, firstMissing } from "./quiz";
import type { QuizAnswers } from "./types";

describe("firstMissing", () => {
  it("finds the first unanswered question", () => {
    expect(firstMissing({ feel: "oily", breakouts: "often", goals: [] })).toBe("stinging");
  });

  it("accepts no goals as an answer", () => {
    const all: QuizAnswers = { feel: "oily", breakouts: "often", stinging: "no", goals: [], age: "<20", pregnant: "no", sun: "some" };
    expect(firstMissing(all)).toBeNull();
  });

  it("walks questions in screen order", () => {
    expect(QUIZ_ORDER[0]).toBe("feel");
    expect(firstMissing({})).toBe("feel");
  });
});
