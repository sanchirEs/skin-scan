// Routine builder: safety filters first, then the best product per slot.
// Strict on purpose until a formulator reviews the rules (spec 7.5).
import { levelRank } from "./concerns";
import { effectiveFlags } from "./flags";
import type {
  Concern,
  ConcernId,
  Product,
  QuizAnswers,
  Routine,
  RoutineSlot,
  SafetyRule,
  Slot,
} from "./types";

export const INGREDIENTS: Record<ConcernId, string[]> = {
  oiliness: ["salicylic acid", "niacinamide"],
  breakouts: ["salicylic acid", "niacinamide", "benzoyl peroxide"],
  uneven: ["vitamin C", "niacinamide", "azelaic acid", "sunscreen"],
  redness: ["azelaic acid", "centella", "fragrance-free formulas"],
  sensitivity: ["centella", "ceramides", "fragrance-free formulas"],
  aging: ["retinoids", "sunscreen"],
  dryness: ["ceramides", "glycerin", "hyaluronic acid"],
  darkCircles: ["caffeine", "vitamin C"],
};

const BASE_SLOTS: Slot[] = [
  "am-cleanser",
  "am-serum",
  "am-moisturizer",
  "am-sunscreen",
  "pm-cleanser",
  "pm-treatment",
  "pm-moisturizer",
];

const MAX_PRODUCTS = 5;

/** The first safety rule a product breaks for this person, if any. */
export function safetyBlock(p: Product, q: QuizAnswers): SafetyRule | null {
  const f = effectiveFlags(p.flags, p.ingredients);
  const pregnant = q.pregnant === "yes" || q.pregnant === "prefer-not";
  if (pregnant && (f.retinoid || f.hydroquinone || (f.salicylicPct ?? 0) > 2 || (f.ahaPct ?? 0) > 10))
    return "pregnancy";
  if (
    q.stinging === "often" &&
    (f.fragrance ||
      f.essentialOils ||
      f.retinoid ||
      (f.ahaPct ?? 0) > 10 ||
      (f.salicylicPct ?? 0) > 2 ||
      (f.bpoPct ?? 0) > 2.5)
  )
    return "very-sensitive";
  if (q.stinging === "sometimes" && (f.fragrance || f.essentialOils)) return "sensitive";
  if (q.age === "<20" && (f.retinoid || (f.ahaPct ?? 0) > 10)) return "under-20";
  return null;
}

function scoreProduct(p: Product, concerns: Concern[], q: QuizAnswers) {
  let score = 0;
  let reason: ConcernId | null = null;
  let best = 0;
  for (const c of concerns) {
    if (!p.helps.includes(c.id)) continue;
    const w = levelRank(c.level);
    score += w;
    if (w > best) {
      best = w;
      reason = c.id;
    }
  }
  if (p.feel.includes(q.feel)) score += 1;
  return { score, reason };
}

/** Which concerns each kind of product can sensibly answer. */
const SLOT_CONCERNS: Partial<Record<Slot, ConcernId[]>> = {
  "am-cleanser": ["oiliness", "breakouts", "sensitivity", "dryness"],
  "pm-cleanser": ["oiliness", "breakouts", "sensitivity", "dryness"],
  "am-moisturizer": ["dryness", "sensitivity", "redness"],
  "pm-moisturizer": ["dryness", "sensitivity", "redness"],
};

const SLOT_FALLBACK: Partial<Record<Slot, string>> = {
  "am-cleanser": "a gentle, fragrance-free cleanser",
  "pm-cleanser": "a gentle, fragrance-free cleanser",
  "am-moisturizer": "a light, fragrance-free moisturizer",
  "pm-moisturizer": "a light, fragrance-free moisturizer",
};

/** Ingredients the safety rules forbid for this person, so hints never suggest them. */
function blockedHints(q: QuizAnswers): RegExp | null {
  const pregnant = q.pregnant === "yes" || q.pregnant === "prefer-not";
  const terms: string[] = [];
  if (pregnant || q.stinging === "often" || q.age === "<20") terms.push("retinoid");
  if (q.stinging === "often") terms.push("benzoyl peroxide");
  return terms.length ? new RegExp(terms.join("|"), "i") : null;
}

function lookFor(slot: Slot, concerns: Concern[], q: QuizAnswers): string[] {
  const blocked = blockedHints(q);
  const safe = (list: string[]) => (blocked ? list.filter((i) => !blocked.test(i)) : list);
  if (slot === "am-sunscreen") return ["broad-spectrum SPF 30 or higher"];
  if (slot === "eye") return safe(INGREDIENTS.darkCircles);
  const allowed = SLOT_CONCERNS[slot];
  for (const c of concerns) {
    if (allowed && !allowed.includes(c.id)) continue;
    const hint = safe(INGREDIENTS[c.id]);
    if (hint.length) return hint;
  }
  return [SLOT_FALLBACK[slot] ?? "niacinamide"];
}

export function buildRoutine(concerns: Concern[], q: QuizAnswers, catalog: Product[]): Routine {
  const excluded: Routine["excluded"] = [];
  const allowed: Product[] = [];
  for (const p of catalog) {
    const rule = safetyBlock(p, q);
    if (rule) excluded.push({ product: p, rule });
    else allowed.push(p);
  }

  const wantsEye = concerns.some((c) => c.id === "darkCircles");
  const slots: Slot[] = wantsEye ? [...BASE_SLOTS, "eye"] : BASE_SLOTS;

  const filled: (RoutineSlot & { score: number })[] = slots.map((slot) => {
    let pick: { p: Product; score: number; reason: ConcernId | null } | null = null;
    for (const p of allowed) {
      if (!p.slot.includes(slot)) continue;
      const s = scoreProduct(p, concerns, q);
      // Never fill a slot with a poor match: it must answer a concern or suit the skin. Sunscreen always counts.
      if (s.score < 1 && slot !== "am-sunscreen") continue;
      if (!pick || s.score > pick.score) pick = { p, score: s.score, reason: s.reason };
    }
    return pick
      ? { slot, product: pick.p, reason: pick.reason, lookFor: [], score: pick.score }
      : { slot, product: null, reason: null, lookFor: lookFor(slot, concerns, q), score: -1 };
  });

  // Keep the routine short: drop the weakest products until at most five remain.
  // A product that is the sunscreen is never dropped, whichever other slot it also fills.
  const distinct = () => new Set(filled.flatMap((s) => (s.product ? [s.product.id] : [])));
  const sunscreenIds = () => new Set(filled.flatMap((s) => (s.slot === "am-sunscreen" && s.product ? [s.product.id] : [])));
  while (distinct().size > MAX_PRODUCTS) {
    const keep = sunscreenIds();
    const candidates = filled.filter((s) => s.product && !keep.has(s.product.id));
    if (!candidates.length) break;
    const weakest = candidates.reduce((a, b) => (b.score < a.score ? b : a));
    const id = weakest.product!.id;
    for (let i = filled.length - 1; i >= 0; i--) if (filled[i].product?.id === id) filled.splice(i, 1);
  }

  const redness = concerns.find((c) => c.id === "redness");
  const seeDermatologist = q.breakouts === "painful" || (redness?.intensity ?? 0) >= 85;

  return {
    slots: filled.map((s) => ({ slot: s.slot, product: s.product, reason: s.reason, lookFor: s.lookFor })),
    excluded,
    seeDermatologist,
  };
}
