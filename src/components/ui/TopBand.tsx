import { BRAND } from "@/config/brand";
import { M } from "@/config/messages";
import type { Step } from "../flow/flow";

const STAGE: Record<Step, number> = {
  welcome: -1,
  tips: 0,
  camera: 0,
  analyzing: 0,
  quiz: 1,
  report: 2,
  order: 3,
  done: 3,
};

/** Brand mark on the left; on later steps, the stage name and a four-part progress line. */
export function TopBand({ step }: { step: Step }) {
  const stage = STAGE[step];
  return (
    <header className="sticky top-0 z-20 bg-strip/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[560px] items-center justify-between gap-4 px-5">
        <span className="flex items-center gap-2">
          <span aria-hidden className="grid h-7 w-7 place-items-center rounded-full bg-cap">
            <span className="block h-2.5 w-2.5 rounded-full bg-cap-tint" />
          </span>
          <span className="type-display text-[18px]">{BRAND.name}</span>
        </span>
        {stage < 0 ? (
          <span className="text-[14px] text-ink-soft">{M.band.duration}</span>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-[13px] font-semibold text-ink-soft">{M.band.steps[stage]}</span>
            <ol className="flex items-center gap-1" aria-label="Progress">
              {M.band.steps.map((label, i) => (
                <li key={label}>
                  <span
                    aria-current={i === stage ? "step" : undefined}
                    className={`block h-1.5 rounded-full transition-all duration-300 ${
                      i === stage ? "w-6 bg-cap" : i < stage ? "w-3 bg-cap/55" : "w-3 bg-rule"
                    }`}
                  />
                  <span className="sr-only">
                    {label}
                    {i < stage ? ", done" : i === stage ? ", current" : ""}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </header>
  );
}
