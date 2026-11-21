"use client";

import { useState } from "react";
import { BRAND } from "@/config/brand";
import { M } from "@/config/messages";
import type { MeasureId } from "@/lib/analysis/types";
import { useFlow } from "../flow/flow";
import { Strip } from "../strip/Strip";
import { Button, LinkButton } from "../ui/Button";
import { DebugPanel } from "./DebugPanel";
import { KeyScale } from "./KeyScale";
import { RoutineList } from "./Routine";
import { ToneKey } from "./ToneKey";
import { useRoutine } from "./useRoutine";
import { ZoneOverlay } from "./ZoneOverlay";

const ANSWER_ONLY = new Set(["breakouts", "dryness", "sensitivity", "aging"]);

export function Report() {
  const { state, dispatch } = useFlow();
  const plan = useRoutine();
  const a = state.analysis;
  const strongest = a ? [...a.readings].sort((x, y) => y.intensity - x.intensity)[0].id : "redness";
  const [selected, setSelected] = useState<MeasureId>(strongest);
  const [showZones, setShowZones] = useState(true);
  // The strip develops once, the first time the reading appears.
  const [develop] = useState(true);

  if (!a || !plan) return null;
  const top = a.readings.find((r) => r.id === strongest)!;
  const levelWord = (r: (typeof a.readings)[number]) =>
    r.id === "shine" && r.label === "balanced" ? M.report.balanced : M.report.levels[r.level];
  const summary =
    top.level === "none" ? M.report.summaryCalm : M.report.summary(M.report.measures[top.id].name, levelWord(top));
  const selectedReading = a.readings.find((r) => r.id === selected)!;
  const answered = plan.concerns.filter((c) => ANSWER_ONLY.has(c.id) || c.source === "answers");

  return (
    <div className="px-5 pt-8 pb-40">
      <h1 className="type-display text-[32px]">{M.report.title}</h1>
      <p className="mt-3 max-w-[34ch] text-[19px] font-semibold leading-snug">{summary}</p>
      <p className="mt-1.5 max-w-[38ch] text-[15px] leading-[1.5] text-ink-soft">{M.report.subtitle}</p>

      <div className="mt-7">
        <Strip
          pads={a.readings.map((r) => ({
            id: r.id,
            intensity: r.intensity,
            label: M.report.measures[r.id].name,
            sublabel: levelWord(r),
          }))}
          develop={develop}
          selected={selected}
          onSelect={(id) => {
            setSelected(id);
            setShowZones(true);
          }}
        />
      </div>

      {/* The meaning of the tapped pad sits right under the strip, before the photo. */}
      <div className="mt-4">
        <KeyScale
          key={selected}
          reading={selectedReading}
          active
          delay={selected === strongest ? 0.9 : 0}
          onSelect={() => setShowZones(true)}
        />
      </div>

      <div className="mt-6">
        <ZoneOverlay
          photoUrl={a.photoUrl}
          zones={a.zones}
          size={a.size}
          measure={selected}
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
