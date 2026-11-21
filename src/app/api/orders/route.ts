import { PRODUCTS } from "@/data/products";
import { WORST_PRODUCTS } from "@/data/products.worst";
import { BRAND } from "@/config/brand";
import { OrderRequest, priceOrder } from "@/lib/order/schema";
import { clientKey, rateLimit, readJson } from "@/lib/server/rate-limit";
import { insertRow, markScanOrdered } from "@/lib/server/supabase";

export async function POST(req: Request) {
  if (!rateLimit(`orders:${clientKey(req)}`, 10, 60_000)) {
    return Response.json({ error: "too-many-requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await readJson(req, 20_000);
  } catch {
    return Response.json({ error: "invalid-body" }, { status: 400 });
  }

  const parsed = OrderRequest.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid-order" }, { status: 400 });
  const order = parsed.data;

  // Dev only: the break-ui worst-case catalog can be ordered too.
  const catalog = process.env.NODE_ENV === "production" ? PRODUCTS : [...PRODUCTS, ...WORST_PRODUCTS];
  const priced = priceOrder(order.items, catalog);
  if ("error" in priced) return Response.json({ error: priced.error }, { status: 400 });

  try {
    await insertRow("orders", {
      id: order.id,
      name: order.name,
      phone: order.phone,
      address: order.address ?? null,
      note: order.note ?? null,
      items: priced.lines,
      total: priced.total,
      currency: BRAND.currency.code,
      scan_scores: order.scanScores,
      quiz: order.quiz,
      consent: order.consent,
      utm_source: order.utm?.source ?? null,
      utm_medium: order.utm?.medium ?? null,
      utm_campaign: order.utm?.campaign ?? null,
    });
  } catch (err) {
    console.error("[skin-check] order insert failed", err);
    return Response.json({ error: "store-failed" }, { status: 502 });
  }

  // The scan id only flips a flag; it is never stored with the order.
  if (order.scanId) await markScanOrdered(order.scanId);

  return Response.json({ id: order.id }, { status: 201 });
}
