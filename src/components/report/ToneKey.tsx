import { M } from "@/config/messages";
import type { Tone } from "@/lib/analysis/types";
import { TONES } from "../strip/colors";

/** Every tone at the same size. The mark says where you are, not how you score. */
export function ToneKey({ tone }: { tone: Tone }) {
  const name = M.report.tone.names[tone.category];
  return (
    <section className="rounded-[var(--radius-strip)] bg-strip-raised px-4 py-4 lift" aria-labelledby="tone-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="tone-title" className="text-[17px] font-semibold">
          {M.report.tone.title}
        </h2>
        <span className="text-[15px] font-semibold">{name}</span>
      </div>
      <ol className="mt-3.5 grid grid-cols-6 gap-1">
        {TONES.map((t) => {
          const mine = t.id === tone.category;
          return (
            <li key={t.id} className="flex flex-col items-center">
              <span
                className={`block h-9 w-full rounded-full ${mine ? "ring-2 ring-ink ring-offset-2 ring-offset-strip-raised" : ""}`}
                style={{ backgroundColor: t.color }}
              />
              <span className={`mt-2 text-center text-[11.5px] leading-tight ${mine ? "font-semibold text-ink" : "text-ink-faint"}`}>
                {M.report.tone.names[t.id]}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[15px] leading-[1.5] text-ink-soft">{M.report.tone.body}</p>
    </section>
  );
}
