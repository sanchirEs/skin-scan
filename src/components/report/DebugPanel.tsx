import type { RawMetrics, Reading } from "@/lib/analysis/types";

/** ?debug=1 only: raw values for tuning thresholds on real faces. */
export function DebugPanel({ raw, readings }: { raw: RawMetrics; readings: Reading[] }) {
  const rows: [string, string][] = [
    ...readings.map((r): [string, string] => [`${r.id} intensity`, `${r.intensity} (${r.level})`]),
    ["redness mean a*", raw.rednessMeanA.toFixed(2)],
    ["redness fraction", raw.rednessFraction.toFixed(3)],
    ["evenness std", raw.evennessStd.toFixed(2)],
    ["spots", `${raw.spotCount} (${raw.spotsPerKpx.toFixed(2)}/kpx)`],
    ["dark circle dL*", raw.darkCircleDeltaL.toFixed(2)],
    ["shine T / cheeks", `${raw.shineT.toFixed(3)} / ${raw.shineCheeks.toFixed(3)}`],
    ["tone L* b* ITA", `${raw.toneL.toFixed(1)} ${raw.toneB.toFixed(1)} ${raw.itaDeg.toFixed(1)}`],
    ...Object.entries(raw.zonePixels).map(([k, v]): [string, string] => [`px ${k}`, String(v)]),
  ];
  return (
    <details className="rounded-[var(--radius-card)] bg-ink px-4 py-3 text-[13px] text-strip" open>
      <summary className="cursor-pointer font-semibold">Debug readings</summary>
      <table className="mt-2 w-full tnum">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="py-0.5 pr-3 text-strip/70">{k}</td>
              <td className="py-0.5 text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
