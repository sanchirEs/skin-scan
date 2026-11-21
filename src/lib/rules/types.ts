import type { Level } from "../analysis/types";

export type Goal = "clear" | "even" | "calm" | "hydrate" | "firm" | "eyes";

export type QuizAnswers = {
  feel: "oily" | "t-zone" | "normal" | "dry";
  breakouts: "rarely" | "sometimes" | "often" | "painful";
  stinging: "no" | "sometimes" | "often";
  goals: Goal[];
  age: "<20" | "20-29" | "30-39" | "40-49" | "50+";
  pregnant: "yes" | "no" | "prefer-not";
  sun: "little" | "some" | "a-lot";
};

export type ConcernId =
  | "oiliness"
  | "breakouts"
  | "redness"
  | "uneven"
  | "darkCircles"
  | "dryness"
  | "sensitivity"
  | "aging";

export const CONCERN_ORDER: ConcernId[] = [
  "oiliness",
  "breakouts",
  "redness",
  "uneven",
  "darkCircles",
  "dryness",
  "sensitivity",
  "aging",
];

export type Concern = {
  id: ConcernId;
  level: Level;
  source: "measured" | "answers" | "both";
  /** Camera intensity 0..100, when the concern was measured. */
  intensity?: number;
};

export type Slot =
  | "am-cleanser"
  | "am-serum"
  | "am-moisturizer"
  | "am-sunscreen"
  | "pm-cleanser"
  | "pm-treatment"
  | "pm-moisturizer"
  | "eye";

export type ProductFlags = {
  retinoid?: boolean;
  hydroquinone?: boolean;
  salicylicPct?: number;
  ahaPct?: number;
  bpoPct?: number;
  fragrance?: boolean;
  essentialOils?: boolean;
};

export type Product = {
  id: string;
  name: string;
  slot: Slot[];
  price: number;
  image: string;
  ingredients: string[];
  helps: ConcernId[];
  feel: QuizAnswers["feel"][];
  flags: ProductFlags;
  sample: true;
};

export type SafetyRule = "pregnancy" | "sensitive" | "very-sensitive" | "under-20";

export type RoutineSlot = {
  slot: Slot;
  product: Product | null;
  reason: ConcernId | null;
  lookFor: string[];
};

export type Routine = {
  slots: RoutineSlot[];
  excluded: { product: Product; rule: SafetyRule }[];
  seeDermatologist: boolean;
};
