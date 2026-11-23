"use client";

import {
  ArrowLeft,
  Cactus,
  Check,
  CircleHalf,
  Diamond,
  Drop,
  DropHalf,
  Eye,
  Leaf,
  Smiley,
  Sparkle,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { M } from "@/config/messages";
import { deviceInfo } from "@/lib/env/camera-support";
import { QUIZ_ORDER, firstMissing } from "@/lib/rules/quiz";
import type { Goal, QuizAnswers } from "@/lib/rules/types";
import { aiNumbers } from "@/lib/ai/numbers";
import { readUtm } from "@/lib/utm";
import { Button } from "../ui/Button";
import { useFlow } from "./flow";

const ORDER = QUIZ_ORDER;

/** Questions shown as picture tiles. The rest are plain rows. */
const ICONS: Partial<Record<string, Record<string, Icon>>> = {
  feel: { oily: Drop, "t-zone": DropHalf, normal: Smiley, dry: Cactus },
  goals: { clear: Sparkle, even: CircleHalf, calm: Leaf, hydrate: Drop, firm: Diamond, eyes: Eye },
};
type Key = (typeof ORDER)[number];

export function Quiz() {
  const { state, dispatch } = useFlow();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [answers, setAnswers] = useState<Partial<QuizAnswers>>({ goals: [] });
  const advancing = useRef(false);
  // The question on screen right now. A tap on a question that is sliding out is ignored.
  const current = useRef(0);

  const key: Key = ORDER[index];
  const q = M.quiz.questions[key];
  const multi = key === "goals";

  const finish = (all: QuizAnswers) => {
    const scanId = crypto.randomUUID();
    const a = state.analysis;
    if (a && !state.demo) {
      // Anonymous numbers only. Fire and forget: the reading never waits on the network.
      void fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: scanId,
          readings: a.readings,
          tone: a.tone,
          ai: aiNumbers(state.ai),
          quality: state.captured?.quality ?? {},
          device: deviceInfo(navigator.userAgent),
          utm: readUtm(),
        }),
        keepalive: true,
      }).catch(() => {});
    }
    dispatch({ type: "quizDone", quiz: all, scanId });
  };

  const goTo = (i: number, direction: 1 | -1) => {
    current.current = i;
    setDir(direction);
    setIndex(i);
  };

  const next = (updated: Partial<QuizAnswers>) => {
    if (current.current < ORDER.length - 1) return goTo(current.current + 1, 1);
    const missing = firstMissing(updated);
    if (missing) return goTo(ORDER.indexOf(missing), -1);
    finish(updated as QuizAnswers);
  };

  const choose = (questionKey: Key, value: string) => {
    if (advancing.current || questionKey !== ORDER[current.current]) return;
    if (multi) {
      const goals = answers.goals ?? [];
      const g = value as Goal;
      const nextGoals = goals.includes(g) ? goals.filter((x) => x !== g) : goals.length < 2 ? [...goals, g] : goals;
      setAnswers({ ...answers, goals: nextGoals });
      return;
    }
    const updated = { ...answers, [key]: value };
    setAnswers(updated);
    advancing.current = true;
    setTimeout(() => {
      advancing.current = false;
      next(updated);
    }, 220);
  };

  const back = () => {
    if (current.current === 0 || advancing.current) return;
    goTo(current.current - 1, -1);
  };

  const selected = (value: string) =>
    multi ? (answers.goals ?? []).includes(value as Goal) : answers[key as Exclude<Key, "goals">] === value;

  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col px-5 pt-6 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-1" aria-hidden>
          {ORDER.map((k, i) => (
            <span
              key={k}
              className={`block h-1.5 flex-1 rounded-full transition-colors duration-300 ${i <= index ? "bg-cap" : "bg-rule"}`}
            />
          ))}
        </div>
        <p className="text-[13px] font-semibold text-ink-soft tnum">{M.quiz.progress(index + 1, ORDER.length)}</p>
      </div>

      <div className="relative mt-7 flex-1 overflow-hidden">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.fieldset
            key={key}
            custom={dir}
            initial={reduce ? { opacity: 0 } : { x: dir * 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { x: dir * -40, opacity: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <legend className="type-display text-[30px]">{q.title}</legend>
            {"hint" in q && q.hint && <p className="mt-2 text-[15px] leading-snug text-ink-soft">{q.hint}</p>}
            {multi && <p className="mt-2 text-[15px] text-ink-soft">{M.quiz.pickUpTo}</p>}
            {ICONS[key] ? (
              <div className="mt-6 grid grid-cols-2 gap-2.5" role={multi ? "group" : "radiogroup"}>
                {Object.entries(q.options).map(([value, label]) => {
                  const on = selected(value);
                  const OptionIcon = ICONS[key]![value];
                  return (
                    <button
                      key={value}
                      type="button"
                      role={multi ? "checkbox" : "radio"}
                      aria-checked={on}
                      onClick={() => choose(key, value)}
                      className={`relative flex min-h-[118px] flex-col justify-between rounded-[var(--radius-card)] p-4 text-left text-[16px] font-semibold leading-snug transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] ${
                        on ? "bg-cap text-cap-ink" : "bg-strip-raised lift hover:ring-1 hover:ring-ink-faint"
                      }`}
                    >
                      <span
                        className={`grid h-10 w-10 place-items-center rounded-full ${on ? "bg-white/15" : "bg-cap-tint text-cap"}`}
                      >
                        {OptionIcon && <OptionIcon size={22} weight="duotone" aria-hidden />}
                      </span>
                      <span className="mt-3 pr-5">{label}</span>
                      {on && <Check size={18} weight="bold" className="absolute top-4 right-4" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-6 grid gap-2.5" role={multi ? "group" : "radiogroup"}>
                {Object.entries(q.options).map(([value, label]) => {
                  const on = selected(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      role={multi ? "checkbox" : "radio"}
                      aria-checked={on}
                      onClick={() => choose(key, value)}
                      className={`flex min-h-[60px] items-center justify-between gap-3.5 rounded-[var(--radius-card)] px-5 py-3 text-left text-[17px] transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99] ${
                        on ? "bg-cap font-semibold text-cap-ink" : "bg-strip-raised lift hover:ring-1 hover:ring-ink-faint"
                      }`}
                    >
                      {label}
                      <span
                        aria-hidden
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition-colors duration-150 ${
                          on ? "bg-white text-cap" : "ring-[1.5px] ring-inset ring-rule"
                        }`}
                      >
                        {on && <Check size={14} weight="bold" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.fieldset>
        </AnimatePresence>
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="quiet" onClick={back} disabled={index === 0} className={`-ml-3 ${index === 0 ? "invisible" : ""}`}>
          <ArrowLeft size={18} weight="bold" aria-hidden />
          {M.quiz.back}
        </Button>
        {multi && (
          <Button onClick={() => next(answers)} className="min-w-[9rem]">
            {M.quiz.next}
          </Button>
        )}
      </div>
    </div>
  );
}
