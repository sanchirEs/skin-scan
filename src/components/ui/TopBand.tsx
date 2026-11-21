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

/** The vial-cap band: brand on the left, the four stages as small pads on the right. */
export function TopBand({ step }: { step: Step }) {
  const stage = STAGE[step];
  return (
    <header className="sticky top-0 z-20 bg-cap text-cap-ink pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-[560px] items-center justify-between px-4">
        <span className="text-[17px] font-semibold" style={{ fontStretch: "112%" }}>
          {BRAND.name}
        </span>
        {stage < 0 ? (
          <span className="text-[14px] text-cap-ink/85">{M.band.duration}</span>
        ) : (
          <ol className="flex items-center gap-1.5" aria-label="Progress">
            {M.band.steps.map((label, i) => (
              <li key={label} className="flex items-center">
                <span
                  aria-current={i === stage ? "step" : undefined}
                  className={`block h-3 w-5 rounded-[3px] transition-colors duration-300 ${
                    i < stage ? "bg-cap-ink/70" : i === stage ? "bg-cap-ink" : "bg-cap-ink/20"
                  }`}
                />
                <span className="sr-only">
                  {label}
                  {i < stage ? ", done" : i === stage ? ", current" : ""}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </header>
  );
}
