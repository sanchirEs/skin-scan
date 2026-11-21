// DEV-ONLY data boundary for the break-ui toggle. Production always gets "demo"
// (the real catalog), because DEMO_ALLOWED is false there.
import { PRODUCTS } from "@/data/products";
import { WORST_PRODUCTS } from "@/data/products.worst";
import type { Reading } from "../analysis/types";
import { DEMO_ALLOWED } from "../demo";
import type { Product } from "../rules/types";

export type DataVariant = "demo" | "worst" | "empty" | "one";
export const DATA_VARIANTS: { id: DataVariant; label: string }[] = [
  { id: "demo", label: "Demo data" },
  { id: "worst", label: "Worst case" },
  { id: "empty", label: "Empty" },
  { id: "one", label: "One" },
];

export function readDataVariant(search: string): DataVariant {
  if (!DEMO_ALLOWED) return "demo";
  const v = new URLSearchParams(search).get("data");
  return v === "worst" || v === "empty" || v === "one" ? v : "demo";
}

export function catalogFor(variant: DataVariant): Product[] {
  switch (variant) {
    case "worst":
      return WORST_PRODUCTS;
    case "empty":
      return [];
    case "one":
      return PRODUCTS.filter((p) => p.id === "daily-shield-spf50");
    default:
      return PRODUCTS;
  }
}

/** Readings at the ends of every key: 100, 0, and level boundaries. */
export const WORST_READINGS: Reading[] = [
  { id: "redness", intensity: 100, level: "high" },
  { id: "evenness", intensity: 45, level: "moderate" },
  { id: "darkCircles", intensity: 0, level: "none" },
  { id: "shine", intensity: 0, level: "none", label: "matte" },
];
