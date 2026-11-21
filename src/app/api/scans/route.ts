import { ScanRequest } from "@/lib/order/schema";
import { clientKey, rateLimit, readJson } from "@/lib/server/rate-limit";
import { insertRow } from "@/lib/server/supabase";

export async function POST(req: Request) {
  if (!rateLimit(`scans:${clientKey(req)}`, 10, 60_000)) {
    return Response.json({ error: "too-many-requests" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await readJson(req, 20_000);
  } catch {
    return Response.json({ error: "invalid-body" }, { status: 400 });
  }

  const parsed = ScanRequest.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid-scan" }, { status: 400 });
  const scan = parsed.data;

  try {
    await insertRow("scans", {
      id: scan.id,
      readings: scan.readings,
      tone: scan.tone,
      quality: scan.quality,
      device_os: scan.device.os,
      device_browser: scan.device.browser,
      utm_source: scan.utm?.source ?? null,
      utm_medium: scan.utm?.medium ?? null,
      utm_campaign: scan.utm?.campaign ?? null,
    });
  } catch (err) {
    console.error("[skin-check] scan insert failed", err);
    return Response.json({ error: "store-failed" }, { status: 502 });
  }

  return Response.json({ id: scan.id }, { status: 201 });
}
