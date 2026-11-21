"use client";

import { motion, useReducedMotion } from "motion/react";
import { BRAND } from "@/config/brand";
import { M } from "@/config/messages";
import { Button, LinkButton } from "../ui/Button";
import { useFlow } from "./flow";

export function ThankYou() {
  const { state, dispatch } = useFlow();
  const reduce = useReducedMotion();
  return (
    <div className="flex min-h-[calc(100dvh-56px)] flex-col px-5 pt-10 pb-[max(20px,env(safe-area-inset-bottom))]">
      <div className="flex-1">
        {/* Every pad of the strip turns teal: the order is in. */}
        <div className="flex gap-2" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              className="block h-10 w-10 rounded-[var(--radius-pad)]"
              initial={reduce ? false : { backgroundColor: "#ffffff", scale: 0.85 }}
              animate={{ backgroundColor: "#0e4d48", scale: 1 }}
              transition={{ type: "spring", damping: 16, stiffness: 260, delay: reduce ? 0 : i * 0.09 }}
            />
          ))}
        </div>
        <h1 className="type-display mt-8 text-[34px]">{M.done.title}</h1>
        <p className="mt-3 max-w-[36ch] text-[17px] leading-[1.55] text-ink-soft">{BRAND.thankYou}</p>
        {state.orderId && (
          <p className="mt-4 text-[14px] text-ink-faint tnum">{M.done.reference(state.orderId.slice(0, 8).toUpperCase())}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <LinkButton href={BRAND.contact.url} variant="secondary" className="w-full">
          {BRAND.contact.label}
        </LinkButton>
        <Button variant="quiet" onClick={() => dispatch({ type: "go", step: "report", dir: -1 })}>
          {M.done.back}
        </Button>
      </div>
    </div>
  );
}
