"use client";

import { ArrowCounterClockwise, ChatCircleText, Eye, EyeSlash, FirstAidKit, Sparkle } from "@phosphor-icons/react/dist/ssr";
import { useState } from "react";
import { BRAND } from "@/config/brand";
import { M } from "@/config/messages";
import type { AiConcernId } from "@/lib/ai/types";
import type { MeasureId } from "@/lib/analysis/types";
import { useFlow } from "../flow/flow";
import { AI_RAMPS, RAMPS, rampChips } from "../strip/colors";
import { Button, LinkButton } from "../ui/Button";
import { AI_ZONES, MEASURE_ZONES } from "../visual/zones";
import { DebugPanel } from "./DebugPanel";
import { KeyCard } from "./KeyCard";
import { KeyScale } from "./KeyScale";
import { PendingCard, ReadingCard } from "./ReadingCard";
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

  const photo = (
    <div className="relative bg-strip px-10 pt-5">
      <ZoneOverlay
        className="mx-auto max-w-[260px] rounded-t-[18px]"
        photoUrl={a.photoUrl}
        zones={a.zones}
        size={a.size}
        measure={selectedReading?.id ?? null}
        maskUrl={selectedAi?.maskUrl ?? null}
        show={showZones}
        spots={a.spots}
      />
      <button
        type="button"
        onClick={() => setShowZones((v) => !v)}
        className="absolute right-3 bottom-3 flex h-9 items-center gap-1.5 rounded-full bg-ink/70 px-3 text-[13px] font-semibold text-white backdrop-blur-sm"
      >
        {showZones ? <EyeSlash size={16} weight="bold" aria-hidden /> : <Eye size={16} weight="bold" aria-hidden />}
        {showZones ? M.report.zonesOff : M.report.zonesOn}
      </button>
    </div>
  );

  return (
    <div className="px-5 pt-7 pb-44">
      <h1 className="type-display text-[38px]">{M.report.title}</h1>
      <p className="mt-3 max-w-[30ch] text-[19px] font-semibold leading-snug">{summary}</p>
      <p className="mt-1.5 max-w-[38ch] text-[15px] leading-[1.5] text-ink-soft">{M.report.subtitle}</p>

      <section className="mt-7" aria-labelledby="findings-title">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="findings-title" className="text-[17px] font-semibold">
            {M.report.findingsTitle}
          </h2>
          {aiResult?.skinAge != null && <span className="text-[13px] text-ink-soft">{M.ai.skinAge(aiResult.skinAge)}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {a.readings.map((r) => (
            <ReadingCard
              key={r.id}
              name={M.report.measures[r.id].name}
              levelWord={levelWord(r)}
              intensity={r.intensity}
              color={RAMPS[r.id][1]}
              zones={MEASURE_ZONES[r.id]}
              selected={selected === `m:${r.id}`}
              onSelect={() => select(`m:${r.id}`)}
            />
          ))}
          {state.ai.status === "done" &&
            aiConcerns.map((c) => (
              <ReadingCard
                key={c.id}
                ai
                name={M.ai.names[c.id]}
                levelWord={M.report.levels[c.level]}
                intensity={c.severity}
                color={AI_RAMPS[c.id][1]}
                zones={AI_ZONES[c.id]}
                selected={selected === `ai:${c.id}`}
                onSelect={() => select(`ai:${c.id}`)}
              />
            ))}
          {state.ai.status === "pending" &&
            (["acne", "wrinkles", "pores", "texture"] as const).map((id) => <PendingCard key={id} name={M.ai.names[id]} />)}
        </div>
        {state.ai.status === "pending" && (
          <p className="mt-3 flex items-center gap-2 text-[14px] text-ink-soft" aria-live="polite">
            <Sparkle size={16} weight="fill" className="text-cap" aria-hidden />
            {M.ai.pending}
          </p>
        )}
        {(state.ai.status === "off" || state.ai.status === "failed" || (state.ai.status === "done" && aiConcerns.length === 0)) && (
          <p className="mt-3 flex gap-2.5 rounded-[var(--radius-card)] bg-cap-tint/60 px-4 py-3 text-[14px] leading-[1.5] text-ink-soft">
            <Sparkle size={18} weight="duotone" className="mt-0.5 shrink-0 text-cap" aria-hidden />
            {aiFailMessage ?? M.ai.off}
          </p>
        )}
      </section>

      {/* The tapped finding in full, with the photo, right under the tiles. */}
      <div className="mt-6">
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
            media={photo}
          />
        ) : selectedReading ? (
          <KeyScale key={selected} reading={selectedReading} delay={0.5} media={photo} />
        ) : null}
      </div>

      <div className="mt-4">
        <ToneKey tone={a.tone} />
      </div>

      {answered.length > 0 && (
        <section className="mt-10" aria-labelledby="answers-title">
          <h2 id="answers-title" className="type-display text-[24px]">
            {M.report.answersTitle}
          </h2>
          <p className="mt-2 flex items-start gap-2 text-[14px] leading-snug text-ink-soft">
            <ChatCircleText size={18} weight="duotone" className="shrink-0 text-cap" aria-hidden />
            {M.report.answersNote}
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {answered.map((c) => (
              <li key={c.id} className="rounded-full bg-strip-raised px-3.5 py-2 text-[14.5px] lift">
                <span className="font-semibold">{M.concerns[c.id]}</span>
                <span className="text-ink-soft">: {M.report.levels[c.level].toLowerCase()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {plan.routine.seeDermatologist && (
        <p className="mt-8 flex gap-3 rounded-[var(--radius-card)] bg-mint px-4 py-3.5 text-[15px] leading-[1.5] text-mint-ink">
          <FirstAidKit size={22} weight="duotone" className="mt-0.5 shrink-0" aria-hidden />
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

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-strip from-75% to-strip/0 pt-6">
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
            <Button variant="quiet" className="-ml-3" onClick={() => dispatch({ type: "retake" })}>
              <ArrowCounterClockwise size={17} weight="bold" aria-hidden />
              {M.report.retake}
            </Button>
            {plan.products.length > 0 && (
              <LinkButton href={BRAND.contact.url} variant="quiet" className="-mr-3">
                {BRAND.contact.label}
              </LinkButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
