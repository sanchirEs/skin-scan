import { Moon, Plus, Sun } from "@phosphor-icons/react/dist/ssr";
import { formatPrice } from "@/config/brand";
import { M } from "@/config/messages";
import type { Concern, ConcernId, Product, Routine as RoutineT, RoutineSlot } from "@/lib/rules/types";
import { ProductArt } from "../visual/ProductArt";

const MORNING = ["am-cleanser", "am-serum", "am-moisturizer", "am-sunscreen"];

/** The one or two concerns this product answers for this person, strongest first. */
function reasonsFor(product: Product, concerns: Concern[], fallback: ConcernId | null): string | null {
  const ids = concerns.filter((c) => product.helps.includes(c.id)).map((c) => c.id);
  const top = (ids.length ? ids : fallback ? [fallback] : []).slice(0, 2);
  return top.length ? top.map((id) => M.concerns[id]).join(" and ") : null;
}

export function ProductCard({
  product,
  slot,
  reason,
  concerns,
}: {
  product: Product;
  slot: RoutineSlot["slot"];
  reason: ConcernId | null;
  concerns: Concern[];
}) {
  const why = reasonsFor(product, concerns, reason);
  return (
    <div className="flex gap-3.5 rounded-[var(--radius-card)] bg-strip-raised p-3 lift">
      <ProductArt id={product.id} slot={slot} className="h-[76px] w-[82px] shrink-0" />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[15.5px] font-semibold leading-snug">{product.name}</p>
          <p className="type-numeral shrink-0 text-[17px] font-semibold">{formatPrice(product.price)}</p>
        </div>
        {product.ingredients.length > 0 && (
          <p className="mt-0.5 text-[13.5px] leading-snug text-ink-soft">{product.ingredients.join(", ")}</p>
        )}
        <p className="mt-2 flex flex-wrap gap-1.5 text-[12px]">
          <span className="rounded-full bg-cap-tint px-2.5 py-0.5 font-semibold text-cap">
            {why ? M.report.forConcern(why) : M.report.everyday}
          </span>
          {product.sample && <span className="rounded-full px-2 py-0.5 text-ink-faint ring-1 ring-rule">{M.report.sample}</span>}
        </p>
      </div>
    </div>
  );
}

function SlotRow({ s, concerns, n, last }: { s: RoutineSlot; concerns: Concern[]; n: number; last: boolean }) {
  return (
    <li className="relative grid grid-cols-[28px_1fr] gap-3">
      {/* The steps are a real order of use, so they are numbered. */}
      <span className="flex flex-col items-center">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-cap text-[13px] font-semibold text-cap-ink tnum">{n}</span>
        {!last && <span aria-hidden className="mt-1 w-px flex-1 bg-rule" />}
      </span>
      <div className="pb-5">
        <p className="mb-2 pt-1 text-[14px] font-semibold text-ink-soft">{M.slots[s.slot]}</p>
        {s.product ? (
          <ProductCard product={s.product} slot={s.slot} reason={s.reason} concerns={concerns} />
        ) : (
          <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-dashed border-ink-faint/50 px-4 py-3.5 text-[14.5px] leading-snug text-ink-soft">
            <Plus size={18} weight="bold" className="shrink-0 text-ink-faint" aria-hidden />
            <span>
              {M.report.emptySlot} {s.lookFor.join(", ")}.
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

export function RoutineList({ routine, concerns }: { routine: RoutineT; concerns: Concern[] }) {
  const morning = routine.slots.filter((s) => MORNING.includes(s.slot));
  const evening = routine.slots.filter((s) => !MORNING.includes(s.slot));
  return (
    <section aria-labelledby="routine-title">
      <h2 id="routine-title" className="type-display text-[30px]">
        {M.report.routineTitle}
      </h2>
      <div className="mt-5 grid gap-6">
        {[
          { title: M.report.morning, slots: morning, Icon: Sun, tint: "bg-[#f6ecd2] text-[#8a6412]" },
          { title: M.report.evening, slots: evening, Icon: Moon, tint: "bg-cap-tint text-cap" },
        ].map((col) => (
          <div key={col.title}>
            <h3 className="flex items-center gap-2.5 text-[18px] font-semibold">
              <span className={`grid h-9 w-9 place-items-center rounded-full ${col.tint}`}>
                <col.Icon size={20} weight="fill" aria-hidden />
              </span>
              {col.title}
            </h3>
            <ol className="mt-4">
              {col.slots.map((s, i) => (
                <SlotRow key={s.slot} s={s} concerns={concerns} n={i + 1} last={i === col.slots.length - 1} />
              ))}
            </ol>
          </div>
        ))}
      </div>
    </section>
  );
}
