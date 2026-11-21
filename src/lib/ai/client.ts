// Sends the face crop, and the side crops when they were taken, to our skin-api
// service (Railway), which holds the provider key. Photos are only sent after
// the person chose the AI check.
import { z } from "zod";
import { AI_CONCERN_IDS, type AiErrorCode, type AiOutcome } from "./types";

const ERROR_CODES: AiErrorCode[] = [
  "bad_image",
  "too_large",
  "no_face",
  "face_too_small",
  "too_dark",
  "pose",
  "image_too_small",
  "rate_limited",
  "not_configured",
  "provider_error",
  "timeout",
];

const Concern = z.object({
  id: z.string(),
  score: z.number(),
  severity: z.number(),
  level: z.enum(["none", "mild", "moderate", "high"]),
  // Provider masks: an https link, or an embedded PNG/JPEG/WebP image. Anything else is dropped.
  maskUrl: z
    .string()
    .refine((u) => /^https:\/\//i.test(u) || /^data:image\/(png|jpeg|webp);base64,/i.test(u))
    .nullable()
    .catch(null),
  regions: z.array(z.object({ name: z.string(), score: z.number() })).catch([]),
});

const Result = z.object({
  provider: z.string(),
  concerns: z.array(Concern),
  skinAge: z.number().nullable().catch(null),
  // Older service versions leave this out: they only ever read the front photo.
  usedSides: z.boolean().catch(false),
});

const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));

/** The front crop, plus the side crops when they were taken. */
export type AiPhotos = { front: Blob; left?: Blob; right?: Blob };

/** Front only: the raw JPEG as the body. With side photos: multipart fields "image", "left", "right". */
function requestBody(photos: AiPhotos): Pick<RequestInit, "body" | "headers"> {
  const { front, left, right } = photos;
  if (!left && !right) return { headers: { "Content-Type": front.type || "image/jpeg" }, body: front };
  const form = new FormData();
  form.append("image", front, "front.jpg");
  if (left) form.append("left", left, "left.jpg");
  if (right) form.append("right", right, "right.jpg");
  // No Content-Type header: fetch writes it with the multipart boundary.
  return { body: form };
}

export async function requestAiAnalysis(
  photos: Blob | AiPhotos,
  opts: { baseUrl?: string; fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<AiOutcome> {
  const baseUrl = (opts.baseUrl ?? process.env.NEXT_PUBLIC_SKIN_API_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) return { ok: false, error: "not_configured" };
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60_000);

  try {
    const res = await fetchImpl(`${baseUrl}/v1/analyze`, {
      method: "POST",
      ...requestBody(photos instanceof Blob ? { front: photos } : photos),
      signal: controller.signal,
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const code = (body as { error?: string } | null)?.error as AiErrorCode | undefined;
      return { ok: false, error: code && ERROR_CODES.includes(code) ? code : "provider_error" };
    }
    const parsed = Result.safeParse(body);
    if (!parsed.success) return { ok: false, error: "provider_error" };
    const concerns = parsed.data.concerns
      .filter((c): c is typeof c & { id: (typeof AI_CONCERN_IDS)[number] } =>
        (AI_CONCERN_IDS as readonly string[]).includes(c.id),
      )
      .map((c) => ({ ...c, score: clamp(c.score), severity: clamp(c.severity) }));
    const { provider, skinAge, usedSides } = parsed.data;
    return { ok: true, result: { provider, concerns, skinAge, usedSides } };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return { ok: false, error: "timeout" };
    return { ok: false, error: "network" };
  } finally {
    clearTimeout(timer);
  }
}
