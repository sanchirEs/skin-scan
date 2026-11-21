"use client";

import { Minus, Plus } from "@phosphor-icons/react/dist/ssr";
import { useId, useMemo, useState, type ReactNode } from "react";
import { BRAND, formatPrice } from "@/config/brand";
import { M } from "@/config/messages";
import type { QuizAnswers } from "@/lib/rules/types";
import { readUtm } from "@/lib/utm";
import { useFlow } from "../flow/flow";
import { useRoutine } from "../report/useRoutine";
import { Button } from "../ui/Button";

type FieldErrors = Partial<Record<"name" | "phone" | "consent" | "items", string>>;
type SubmitError = "network" | "server" | "rate" | null;

function Field({
  label,
  optional,
  help,
  error,
  children,
}: {
  label: string;
  optional?: boolean;
  help?: string;
  error?: string;
  children: (ids: { id: string; describedBy?: string }) => ReactNode;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const errId = `${id}-err`;
  const describedBy = [help ? helpId : null, error ? errId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
        {optional && <span className="font-normal text-ink-faint"> ({M.order.optional})</span>}
      </label>
      {children({ id, describedBy })}
      {help && (
        <p id={helpId} className="text-[13px] text-ink-faint">
          {help}
        </p>
      )}
      {error && (
        <p id={errId} className="text-[14px] font-semibold text-stamp">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass =
  "h-12 w-full rounded-[var(--radius-field)] bg-flash px-3.5 text-[17px] text-ink ring-1 ring-rule placeholder:text-ink-faint " +
  "outline-none transition-shadow duration-150 focus:ring-2 focus:ring-cap aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-stamp";

export function OrderForm() {
  const { state, dispatch } = useFlow();
  const plan = useRoutine();
  const [orderId] = useState(() => crypto.randomUUID());
  const [lines, setLines] = useState<Record<string, { qty: number; on: boolean }>>(() =>
    Object.fromEntries((plan?.products ?? []).map((p) => [p.id, { qty: 1, on: true }])),
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<SubmitError>(null);
  const [pending, setPending] = useState(false);

  const products = useMemo(() => plan?.products ?? [], [plan]);
  const total = useMemo(
    () => products.reduce((t, p) => t + (lines[p.id]?.on ? p.price * lines[p.id].qty : 0), 0),
    [products, lines],
  );

  if (!plan || !state.analysis || !state.quiz) return null;

  const clearError = (field: keyof FieldErrors) => setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  const setLine = (id: string, patch: Partial<{ qty: number; on: boolean }>) => {
    setLines((l) => ({ ...l, [id]: { ...l[id], ...patch } }));
    if (patch.on) clearError("items");
  };

  const validate = (): FieldErrors => {
    const e: FieldErrors = {};
    if (!name.trim()) e.name = M.order.errors.name;
    if (!/^[+0-9 ()-]{5,25}$/.test(phone.trim()) || phone.replace(/\D/g, "").length < 5) e.phone = M.order.errors.phone;
    if (!consent) e.consent = M.order.errors.consent;
    if (!Object.values(lines).some((l) => l.on)) e.items = M.order.errors.items;
    return e;
  };

  const submit = async () => {
    if (pending) return;
    const e = validate();
    setErrors(e);
    setSubmitError(null);
    if (Object.keys(e).length) return;
    setPending(true);
    // The pregnancy answer is used only for safety filtering and never sent.
    const quiz: Partial<QuizAnswers> = { ...state.quiz! };
    delete quiz.pregnant;
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: orderId,
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim() || undefined,
          note: note.trim() || undefined,
          consent: true,
          items: products.filter((p) => lines[p.id]?.on).map((p) => ({ productId: p.id, qty: lines[p.id].qty })),
          scanScores: { readings: state.analysis!.readings, tone: state.analysis!.tone },
          quiz,
          scanId: state.scanId ?? undefined,
          utm: readUtm(),
        }),
      });
      if (res.status === 201) {
        dispatch({ type: "ordered", id: orderId });
        return;
      }
      setSubmitError(res.status === 429 ? "rate" : "server");
    } catch {
      setSubmitError("network");
    }
    setPending(false);
  };

  return (
    <div className="px-5 pt-5 pb-10">
      <Button variant="quiet" className="-ml-3" onClick={() => dispatch({ type: "go", step: "report", dir: -1 })}>
        {M.order.back}
      </Button>
      <h1 className="type-display mt-3 text-[32px]">{M.order.title}</h1>
      <p className="mt-2.5 max-w-[38ch] text-[16px] leading-[1.5] text-ink-soft">{M.order.body}</p>

      <ul className="mt-7 space-y-2.5" aria-label="Products">
        {products.map((p) => {
          const line = lines[p.id];
          return (
            <li
              key={p.id}
              className={`rounded-[var(--radius-card)] px-4 py-3.5 ring-1 transition-colors duration-200 ${
                line.on ? "bg-strip-raised ring-rule" : "bg-transparent ring-rule/70"
              }`}
            >
              {/* Name gets the full width; controls sit on their own row so long names never crush. */}
              <div className="flex items-start justify-between gap-3">
                <p className={`min-w-0 text-[16px] font-semibold leading-snug ${line.on ? "" : "text-ink-faint line-through"}`}>
                  {p.name}
                </p>
                {line.on ? (
                  <span className="type-numeral shrink-0 text-[17px] font-semibold">{formatPrice(p.price)}</span>
                ) : (
                  <span className="shrink-0 text-[14px] font-semibold text-stamp">{M.order.removed}</span>
                )}
              </div>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                {line.on ? (
                  <>
                    <div className="flex items-center rounded-full ring-1 ring-rule" role="group" aria-label={`${M.order.qty}, ${p.name}`}>
                      <button
                        type="button"
                        aria-label={M.order.less}
                        disabled={line.qty <= 1}
                        onClick={() => setLine(p.id, { qty: line.qty - 1 })}
                        className="grid h-10 w-10 place-items-center rounded-full text-ink disabled:text-ink-faint/60"
                      >
                        <Minus size={16} weight="bold" />
                      </button>
                      <span className="type-numeral w-5 text-center text-[18px] font-semibold" aria-live="polite">
                        {line.qty}
                      </span>
                      <button
                        type="button"
                        aria-label={M.order.more}
                        disabled={line.qty >= 9}
                        onClick={() => setLine(p.id, { qty: line.qty + 1 })}
                        className="grid h-10 w-10 place-items-center rounded-full text-ink disabled:text-ink-faint/60"
                      >
                        <Plus size={16} weight="bold" />
                      </button>
                    </div>
                    <Button variant="quiet" className="text-[14px]" onClick={() => setLine(p.id, { on: false })}>
                      {M.order.remove}
                    </Button>
                  </>
                ) : (
                  <Button variant="quiet" className="-ml-3 text-[14px]" onClick={() => setLine(p.id, { on: true })}>
                    {M.order.addBack}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {errors.items && <p className="mt-2 text-[14px] font-semibold text-stamp">{errors.items}</p>}

      <div className="mt-4 flex items-baseline justify-between border-t border-rule pt-4">
        <span className="text-[17px] font-semibold">{M.order.total}</span>
        <span className="type-numeral text-[26px] font-semibold">{formatPrice(total)}</span>
      </div>
      <p className="mt-1 text-[14px] text-ink-soft">{M.order.payLater}</p>

      <form
        className="mt-8 grid gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label={M.order.name} error={errors.name}>
          {({ id, describedBy }) => (
            <input
              id={id}
              className={inputClass}
              autoComplete="name"
              value={name}
              maxLength={80}
              aria-invalid={!!errors.name}
              aria-describedby={describedBy}
              onChange={(e) => {
                setName(e.target.value);
                clearError("name");
              }}
            />
          )}
        </Field>
        <Field label={M.order.phone} help={M.order.phoneHelp} error={errors.phone}>
          {({ id, describedBy }) => (
            <input
              id={id}
              className={inputClass}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              maxLength={25}
              aria-invalid={!!errors.phone}
              aria-describedby={describedBy}
              onChange={(e) => {
                setPhone(e.target.value);
                clearError("phone");
              }}
            />
          )}
        </Field>
        <Field label={M.order.address} optional>
          {({ id }) => (
            <input
              id={id}
              className={inputClass}
              autoComplete="street-address"
              value={address}
              maxLength={200}
              onChange={(e) => setAddress(e.target.value)}
            />
          )}
        </Field>
        <Field label={M.order.note} optional>
          {({ id }) => (
            <textarea
              id={id}
              className={`${inputClass} h-24 py-3`}
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-[15px] leading-[1.45]">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                clearError("consent");
              }}
              aria-invalid={!!errors.consent}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-[4px] bg-flash ring-1 ring-ink-faint transition-colors checked:bg-cap checked:ring-cap aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-stamp"
            />
            <span>{M.order.consent(BRAND.name)}</span>
          </label>
          {errors.consent && <p className="mt-1.5 pl-8 text-[14px] font-semibold text-stamp">{errors.consent}</p>}
        </div>

        {submitError && (
          <p role="alert" className="rounded-[var(--radius-field)] bg-stamp/8 px-4 py-3 text-[15px] font-semibold text-stamp ring-1 ring-stamp/30">
            {M.order.errors[submitError]}
          </p>
        )}

        <Button type="submit" className="mt-1 w-full" disabled={pending} aria-busy={pending}>
          {pending ? M.order.sending : M.order.submit}
        </Button>
      </form>
    </div>
  );
}
