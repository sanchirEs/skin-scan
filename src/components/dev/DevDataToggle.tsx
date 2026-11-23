"use client";

import { DATA_VARIANTS } from "@/lib/dev/data-variant";
import { useFlow } from "../flow/flow";

/** DEV-ONLY break-ui switch. Rendered only in demo mode, which production disables. */
export function DevDataToggle() {
  const { state, dispatch } = useFlow();
  return (
    <div
      role="group"
      aria-label="Dev data set"
      className="fixed left-2 bottom-2 z-50 opacity-70 hover:opacity-100 flex gap-0.5 rounded-full bg-[#e2e2e2] p-0.5 font-[system-ui] text-[12px] shadow"
    >
      {DATA_VARIANTS.map((v) => (
        <button
          key={v.id}
          type="button"
          aria-pressed={state.data === v.id}
          onClick={() => {
            const url = new URL(window.location.href);
            if (v.id === "demo") url.searchParams.delete("data");
            else url.searchParams.set("data", v.id);
            window.history.replaceState(null, "", url);
            dispatch({ type: "data", data: v.id });
          }}
          className={`rounded-full px-2.5 py-1 ${state.data === v.id ? "bg-white text-black" : "text-[#555]"}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}
