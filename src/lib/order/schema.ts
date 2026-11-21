// Request schemas shared by the client and the API routes. Top-level objects
// are strict, so a stray image field can never reach the database.
import { z } from "zod";
import { AI_CONCERN_IDS } from "../ai/types";
import type { Product } from "../rules/types";

const ReadingSchema = z.strictObject({
  id: z.enum(["redness", "evenness", "darkCircles", "shine"]),
  intensity: z.number().min(0).max(100),
  level: z.enum(["none", "mild", "moderate", "high"]),
  label: z.enum(["matte", "balanced", "shiny"]).optional(),
});

const ToneSchema = z.strictObject({
  ita: z.number().min(-90).max(90),
  category: z.enum(["very-light", "light", "intermediate", "tan", "brown", "dark"]),
});

// AI findings travel as numbers only: no mask URLs, no images.
const AiScoresSchema = z
  .array(
    z.strictObject({
      id: z.enum(AI_CONCERN_IDS),
      severity: z.number().min(0).max(100),
      level: z.enum(["none", "mild", "moderate", "high"]),
    }),
  )
  .max(12)
  .optional();

const UtmSchema = z
  .strictObject({
    source: z.string().max(100).optional(),
    medium: z.string().max(100).optional(),
    campaign: z.string().max(100).optional(),
  })
  .optional();

// Not strict: unknown keys (the pregnancy answer) are stripped, never stored.
const QuizSchema = z.object({
  feel: z.enum(["oily", "t-zone", "normal", "dry"]),
  breakouts: z.enum(["rarely", "sometimes", "often", "painful"]),
  stinging: z.enum(["no", "sometimes", "often"]),
  goals: z.array(z.enum(["clear", "even", "calm", "hydrate", "firm", "eyes"])).max(2),
  age: z.enum(["<20", "20-29", "30-39", "40-49", "50+"]),
  sun: z.enum(["little", "some", "a-lot"]),
});

export const OrderRequest = z.strictObject({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  phone: z
    .string()
    .trim()
    .min(5)
    .max(25)
    .regex(/^[+0-9 ()-]+$/),
  address: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
  consent: z.literal(true),
  items: z
    .array(z.strictObject({ productId: z.string().max(60), qty: z.number().int().min(1).max(9) }))
    .min(1)
    .max(10),
  scanScores: z.strictObject({ readings: z.array(ReadingSchema).max(4), tone: ToneSchema, ai: AiScoresSchema }),
  quiz: QuizSchema,
  scanId: z.uuid().optional(),
  utm: UtmSchema,
});
export type OrderRequest = z.infer<typeof OrderRequest>;

export const ScanRequest = z.strictObject({
  id: z.uuid(),
  readings: z.array(ReadingSchema).max(4),
  tone: ToneSchema,
  ai: AiScoresSchema,
  quality: z.record(z.string().max(40), z.number()),
  device: z.strictObject({ os: z.string().max(40), browser: z.string().max(40) }),
  utm: UtmSchema,
});
export type ScanRequest = z.infer<typeof ScanRequest>;

export type PricedLine = { productId: string; name: string; unitPrice: number; qty: number };

export function priceOrder(
  items: { productId: string; qty: number }[],
  catalog: Product[],
): { lines: PricedLine[]; total: number } | { error: "unknown-product" } {
  const lines: PricedLine[] = [];
  for (const item of items) {
    const p = catalog.find((c) => c.id === item.productId);
    if (!p) return { error: "unknown-product" };
    lines.push({ productId: p.id, name: p.name, unitPrice: p.price, qty: item.qty });
  }
  const total = Math.round(lines.reduce((t, l) => t + l.unitPrice * l.qty, 0) * 100) / 100;
  return { lines, total };
}
