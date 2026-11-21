import { formatPrice } from "@/config/brand";
import { M } from "@/config/messages";
import type { Concern, ConcernId, Product, Routine as RoutineT, RoutineSlot } from "@/lib/rules/types";

const MORNING = ["am-cleanser", "am-serum", "am-moisturizer", "am-sunscreen"];

/** The one or two concerns this product answers for this person, strongest first. */
function reasonsFor(product: Product, concerns: Concern[], fallback: ConcernId | null): string | null {
  const ids = concerns.filter((c) => product.helps.includes(c.id)).map((c) => c.id);
  const top = (ids.length ? ids : fallback ? [fallback] : []).slice(0, 2);
  return top.length ? top.map((id) => M.concerns[id]).join(" and ") : null;
}

export function ProductCard({
  product,
  reason,
  concerns,
}: {
  product: Product;
  reason: ConcernId | null;
  concerns: Concern[];
}) {
  const why = reasonsFor(product, concerns, reason);
  return (
    <div className="rounded-[var(--radius-card)] bg-strip-raised px-4 py-3.5 ring-1 ring-rule">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[16px] font-semibold leading-snug">{product.name}</p>
        <p className="type-numeral shrink-0 text-[18px] font-semibold">{formatPrice(product.price)}</p>
      </div>
      {product.ingredients.length > 0 && (
        <p className="mt-1 text-[14px] leading-snug text-ink-soft">{product.ingredients.join(", ")}</p>
      )}
      <p className="mt-2.5 flex flex-wrap gap-1.5 text-[12.5px]">
        <span className="rounded-full bg-cap-tint px-2.5 py-1 font-semibold text-cap-deep">
          {why ? M.report.forConcern(why) : M.report.everyday}
        </span>
        {product.sample && <span className="rounded-full px-2.5 py-1 text-ink-faint ring-1 ring-rule">{M.report.sample}</span>}
      </p>
    </div>
  );
}

function SlotRow({ s, concerns }: { s: RoutineSlot; concerns: Concern[] }) {
  return (
    <li>
      <p className="mb-1.5 text-[13px] text-ink-faint">{M.slots[s.slot]}</p>
      {s.product ? (
        <ProductCard product={s.product} reason={s.reason} concerns={concerns} />
      ) : (
        <div className="rounded-[var(--radius-card)] border border-dashed border-ink-faint/60 px-4 py-3.5 text-[15px] leading-snug text-ink-soft">
          {M.report.emptySlot} {s.lookFor.join(", ")}.
        </div>
      )}
    </li>
  );
}

export function RoutineList({ routine, concerns }: { routine: RoutineT; concerns: Concern[] }) {
  const morning = routine.slots.filter((s) => MORNING.includes(s.slot));
  const evening = routine.slots.filter((s) => !MORNING.includes(s.slot));
  return (
    <section aria-labelledby="routine-title">
      <h2 id="routine-title" className="type-display text-[24px]">
        {M.report.routineTitle}
      </h2>
      <div className="mt-5 grid gap-7 sm:grid-cols-2 sm:gap-5">
        {[
          { title: M.report.morning, slots: morning },
          { title: M.report.evening, slots: evening },
        ].map((col) => (
          <div key={col.title}>
            <h3 className="text-[17px] font-semibold">{col.title}</h3>
            <ol className="mt-3 space-y-3.5">
              {col.slots.map((s) => (
                <SlotRow key={s.slot} s={s} concerns={concerns} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
