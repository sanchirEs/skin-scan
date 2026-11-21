"use client";

import { useState } from "react";
import { BRAND } from "@/config/brand";
import { M } from "@/config/messages";
import type { AiConcernId } from "@/lib/ai/types";
import type { MeasureId } from "@/lib/analysis/types";
import { useFlow } from "../flow/flow";
import { AI_RAMPS, RAMPS, rampChips } from "../strip/colors";
import { Strip } from "../strip/Strip";
import { Button, LinkButton } from "../ui/Button";
import { DebugPanel } from "./DebugPanel";
import { KeyCard } from "./KeyCard";
import { KeyScale } from "./KeyScale";
import { RoutineList } from "./Routine";
import { ToneKey } from "./ToneKey";
import { useRoutine } from "./useRoutine";
import { ZoneOverlay } from "./ZoneOverlay";

const ANSWER_ONLY = new Set(["breakouts", "dryness", "sensitivity", "aging"]);

/** Pad keys are "m:<measure>" for on-phone readings and "ai:<concern>" for the AI check. */
type PadKey = `m:${MeasureId}` | `ai:${AiConcernId}`;

export function Report() {
  const { state, dispatch } = useFlow();
  const plan = useRoutine();
  const a = state.analysis;
  const aiResult = state.ai.status === "done" ? state.ai.result : null;
  const aiConcerns = aiResult?.concerns ?? [];

  // Start on the strongest finding, AI first when it already arrived.
  const ranked: { key: PadKey; severity: number }[] = [
    ...aiConcerns.map((c) => ({ key: `ai:${c.id}` as PadKey, severity: c.severity })),
    ...(a?.readings ?? []).map((r) => ({ key: `m:${r.id}` as PadKey, severity: r.intensity })),
  ].sort((x, y) => y.severity - x.severity);
  const [selected, setSelected] = useState<PadKey>(ranked[0]?.key ?? "m:redness");
  const [showZones, setShowZones] = useState(true);
  // The strip develops once, the first time the reading appears.
  const [develop] = useState(true);

  if (!a || !plan) return null;

  const levelWord = (r: (typeof a.readings)[number]) =>
    r.id === "shine" && r.label === "balanced" ? M.report.balanced : M.report.levels[r.level];
  const top = ranked[0];
  const topLevel =
    top?.key.startsWith("ai:")
      ? aiConcerns.find((c) => `ai:${c.id}` === top.key)!.level
      : a.readings.find((r) => `m:${r.id}` === top?.key)?.level ?? "none";
  const topName = top
    ? top.key.startsWith("ai:")
      ? M.ai.names[top.key.slice(3) as AiConcernId]
      : M.report.measures[top.key.slice(2) as MeasureId].name
    : "";
  const summary = !top || topLevel === "none" ? M.report.summaryCalm : M.report.summary(topName, M.report.levels[topLevel]);

  const selectedAi = selected.startsWith("ai:") ? aiConcerns.find((c) => `ai:${c.id}` === selected) : undefined;
  const selectedReading = selected.startsWith("m:") ? a.readings.find((r) => `m:${r.id}` === selected) : undefined;
  const select = (key: string) => {
    setSelected(key as PadKey);
    setShowZones(true);
  };
  const answered = plan.concerns.filter((c) => ANSWER_ONLY.has(c.id) || c.source === "answers");
  const aiFailMessage =
    state.ai.status === "failed" ? M.ai.failed[state.ai.error] ?? M.ai.failed.default : null;

  return (
    <div className="px-5 pt-8 pb-40">
      <h1 className="type-display text-[32px]">{M.report.title}</h1>
      <p className="mt-3 max-w-[34ch] text-[19px] font-semibold leading-snug">{summary}</p>
      <p className="mt-1.5 max-w-[38ch] text-[15px] leading-[1.5] text-ink-soft">{M.report.subtitle}</p>

      <section className="mt-7" aria-labelledby="ai-title">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <h2 id="ai-title" className="text-[17px] font-semibold">
            {M.ai.title}
          </h2>
          {aiResult?.skinAge != null && <span className="text-[13px] text-ink-soft">{M.ai.skinAge(aiResult.skinAge)}</span>}
        </div>
        {state.ai.status === "done" && aiConcerns.length > 0 ? (
          <Strip
            pads={aiConcerns.map((c) => ({
              id: `ai:${c.id}`,
              intensity: c.severity,
              label: M.ai.names[c.id],
              sublabel: M.report.levels[c.level],
              ramp: AI_RAMPS[c.id],
            }))}
            develop={develop}
            selected={selected}
            onSelect={select}
          />
        ) : state.ai.status === "pending" ? (
          <>
            <Strip
              pads={(["acne", "wrinkles", "pores", "texture"] as const).map((id) => ({
                id: `ai:${id}`,
                intensity: 0,
                label: M.ai.names[id],
                ramp: AI_RAMPS[id],
              }))}
              pending
            />
            <p className="mt-2 text-[14px] text-ink-soft" aria-live="polite">
              {M.ai.pending}
            </p>
          </>
        ) : (
          <p className="rounded-[var(--radius-card)] bg-strip-raised px-4 py-3.5 text-[15px] leading-[1.5] text-ink-soft ring-1 ring-rule">
            {aiFailMessage ?? M.ai.off}
          </p>
        )}
      </section>

      <section className="mt-6" aria-labelledby="phone-title">
        <h2 id="phone-title" className="mb-2.5 text-[17px] font-semibold">
          {M.report.phoneTitle}
        </h2>
        <Strip
          pads={a.readings.map((r) => ({
            id: `m:${r.id}`,
            intensity: r.intensity,
            label: M.report.measures[r.id].name,
            sublabel: levelWord(r),
            ramp: RAMPS[r.id],
          }))}
          develop={develop}
          selected={selected}
          onSelect={select}
        />
      </section>

      {/* The meaning of the tapped pad sits right under the strips, before the photo. */}
      <div className="mt-4">
        {selectedAi ? (
          <KeyCard
            key={selected}
            name={M.ai.names[selectedAi.id]}
            levelWord={M.report.levels[selectedAi.level]}
            intensity={selectedAi.severity}
            chips={rampChips(AI_RAMPS[selectedAi.id])}
            ends={M.ai.measures[selectedAi.id]?.ends ?? ["Low", "High"]}
            sentence={
              M.ai.measures[selectedAi.id]?.say[selectedAi.level] ??
              `${M.report.levels[selectedAi.level]}: ${M.ai.names[selectedAi.id].toLowerCase()}.`
            }
            where={selectedAi.maskUrl ? M.ai.measures[selectedAi.id]?.where : undefined}
            onSelect={() => setShowZones(true)}
          />
        ) : selectedReading ? (
          <KeyScale key={selected} reading={selectedReading} delay={0.9} onSelect={() => setShowZones(true)} />
        ) : null}
      </div>

      <div className="mt-6">
        <ZoneOverlay
          photoUrl={a.photoUrl}
          zones={a.zones}
          size={a.size}
          measure={selectedReading?.id ?? null}
          maskUrl={selectedAi?.maskUrl ?? null}
          show={showZones}
          spots={a.spots}
        />
        <div className="mt-2 flex justify-center">
          <Button variant="quiet" onClick={() => setShowZones((v) => !v)}>
            {showZones ? M.report.zonesOff : M.report.zonesOn}
          </Button>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <ToneKey tone={a.tone} />
      </div>

      {answered.length > 0 && (
        <section className="mt-10" aria-labelledby="answers-title">
          <h2 id="answers-title" className="type-display text-[24px]">
            {M.report.answersTitle}
          </h2>
          <p className="mt-2 flex items-center gap-2 text-[14px] text-ink-soft">
            <span className="rounded-full px-2 py-0.5 text-[11.5px] font-semibold text-stamp ring-1 ring-stamp/50">
              {M.report.fromAnswers}
            </span>
            {M.report.answersNote}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {answered.map((c) => (
              <li key={c.id} className="rounded-full bg-strip-raised px-3.5 py-1.5 text-[15px] ring-1 ring-rule">
                {M.concerns[c.id]}: {M.report.levels[c.level].toLowerCase()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.routine.seeDermatologist && (
        <p className="mt-8 rounded-[var(--radius-card)] bg-cap-tint px-4 py-3.5 text-[15px] leading-[1.5] text-cap-deep">
          {M.report.dermatologist}
        </p>
      )}

      <div className="mt-10">
        <RoutineList routine={plan.routine} concerns={plan.concerns} />
      </div>

      <p className="mt-10 max-w-[44ch] text-[13px] leading-[1.5] text-ink-faint">{M.report.disclaimer}</p>

      {state.debug && (
        <div className="mt-6">
          <DebugPanel raw={a.raw} readings={a.readings} />
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-strip/95 backdrop-blur-sm">
        <div className="mx-auto max-w-[560px] px-5 pt-3 pb-[max(14px,env(safe-area-inset-bottom))]">
          {state.orderId ? (
            <p className="py-3 text-center text-[15px] font-semibold text-cap-deep">{M.report.orderSent}</p>
          ) : plan.products.length > 0 ? (
            <Button className="w-full" onClick={() => dispatch({ type: "go", step: "order" })}>
              {M.report.order}
            </Button>
          ) : (
            <>
              <p className="mb-2 text-[14px] leading-snug text-ink-soft">{M.report.nothingToOrder}</p>
              <LinkButton href={BRAND.contact.url} variant="primary" className="w-full">
                {BRAND.contact.label}
              </LinkButton>
            </>
          )}
          <div className="mt-1.5 flex items-center justify-between">
            <Button variant="quiet" onClick={() => dispatch({ type: "retake" })}>
              {M.report.retake}
            </Button>
            {plan.products.length > 0 && (
              <LinkButton href={BRAND.contact.url} variant="quiet">
                {BRAND.contact.label}
              </LinkButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
