"use client";

import { ArrowLeft, Check, Phone } from "@phosphor-icons/react/dist/ssr";
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
      <div className="flex-1 text-center">
        <div className="relative mx-auto grid h-28 w-28 place-items-center">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-mint"
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", damping: 14, stiffness: 200 }}
          />
          <motion.span
            className="relative grid h-16 w-16 place-items-center rounded-full bg-mint-ink text-white"
            initial={reduce ? false : { scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 12, stiffness: 260, delay: reduce ? 0 : 0.15 }}
          >
            <Check size={32} weight="bold" aria-hidden />
          </motion.span>
        </div>
        <h1 className="type-display mt-8 text-[40px]">{M.done.title}</h1>
        <p className="mx-auto mt-3 max-w-[32ch] text-[17px] leading-[1.55] text-ink-soft">{BRAND.thankYou}</p>
        {state.orderId && (
          <p className="mx-auto mt-6 inline-flex items-center gap-2 rounded-full bg-strip-raised px-4 py-2 text-[14px] font-semibold tnum lift">
            <Phone size={16} weight="duotone" className="text-cap" aria-hidden />
            {M.done.reference(state.orderId.slice(0, 8).toUpperCase())}
          </p>
        )}

        <section className="mt-10 rounded-[var(--radius-card)] bg-strip-raised p-5 text-left lift" aria-labelledby="next-title">
          <h2 id="next-title" className="text-[17px] font-semibold">
            {M.done.nextTitle}
          </h2>
          <ol className="mt-4 grid gap-3.5">
            {M.done.next.map((line, i) => (
              <li key={line} className="flex items-start gap-3 text-[15px] leading-snug text-ink-soft">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-cap-tint text-[13px] font-semibold text-cap tnum">
                  {i + 1}
                </span>
                <span className="pt-0.5">{line}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="mt-8 flex flex-col gap-2">
        <LinkButton href={BRAND.contact.url} variant="secondary" className="w-full">
          {BRAND.contact.label}
        </LinkButton>
        <Button variant="quiet" onClick={() => dispatch({ type: "go", step: "report", dir: -1 })}>
          <ArrowLeft size={18} weight="bold" aria-hidden />
          {M.done.back}
        </Button>
      </div>
    </div>
  );
}
