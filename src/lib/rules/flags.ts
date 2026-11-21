// Safety net: read risky ingredients straight from the ingredient list, so a
// product whose hand-set flags were forgotten is still filtered. Flags can only
// get stricter here, never looser. Tuned for real INCI lists: pH adjusters,
// "fragrance-free" claims and the BHA preservative are not flagged.
import type { ProductFlags } from "./types";

const RETINOID =
  /\b(retin(ol|al|oid|oic|aldehyde)|retinyl|tretinoin|adapalene|tazarotene|trifarotene|isotretinoin|hydroxypinacolone retinoate)/i;
const HYDROQUINONE = /\bhydroquinone\b/i;
const FRAGRANCE = /\b(parfum|fragrance|perfume)\b(?![- ]?free)/i;
const ESSENTIAL_OIL =
  /\b(lavender|lavandula|tea tree|melaleuca|peppermint|mentha|eucalyptus|lemon|citrus|bergamot|orange|rosemary|rosmarinus|ylang[- ]ylang|cananga|geranium|pelargonium|clove|eugenia|cinnamon|citronella|lemongrass|cymbopogon)\b.*\b(oil|essential)\b/i;
/** Exfoliating AHAs. Citric, malic and tartaric acid only count with a strength, as they are usually pH adjusters. */
const AHA_EXFOLIANT = /\b(glycolic|lactic|mandelic)\s+acid\b/i;
const AHA_ADJUSTER = /\b(citric|malic|tartaric)\s+acid\b/i;

/** Percentage written next to an ingredient, e.g. "glycolic acid 12%", or null when none is written. */
function strength(ingredient: string): number | null {
  const m = ingredient.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? Number(m[1]) : null;
}

export function effectiveFlags(flags: ProductFlags, ingredients: string[]): ProductFlags {
  const out: ProductFlags = { ...flags };
  const raise = (key: "salicylicPct" | "ahaPct" | "bpoPct", value: number) => {
    out[key] = Math.max(out[key] ?? 0, value);
  };
  for (const ing of ingredients) {
    const pct = strength(ing);
    if (RETINOID.test(ing)) out.retinoid = true;
    if (HYDROQUINONE.test(ing)) out.hydroquinone = true;
    if (FRAGRANCE.test(ing)) out.fragrance = true;
    if (ESSENTIAL_OIL.test(ing)) out.essentialOils = true;
    // Unwritten strengths assume the usual over-the-counter level.
    if (/\bsalicylic acid\b/i.test(ing)) raise("salicylicPct", pct ?? 2);
    if (AHA_EXFOLIANT.test(ing)) raise("ahaPct", pct ?? 5);
    if (AHA_ADJUSTER.test(ing) && pct !== null) raise("ahaPct", pct);
    if (/\bbenzoyl peroxide\b/i.test(ing)) raise("bpoPct", pct ?? 5);
  }
  return out;
}
