export const BASE = "https://yce.test";
export const API_KEY = "sk-test-SECRET-123";
export const S3_URL = "https://s3.test/bucket/face?X-Amz-Signature=abc";

type Step = "file" | "upload" | "task" | "poll";

export interface Call {
  step: Step | "unknown";
  method: string;
  url: string;
  /** Lower-cased header map. */
  headers: Record<string, string>;
  /** Headers exactly as passed to fetch. */
  rawHeaders: unknown;
  body: unknown;
}

export interface FakeOptions {
  /** Successive poll response bodies; the last one repeats forever. */
  polls?: unknown[];
  /** Replace one step's HTTP reply. */
  replies?: Partial<Record<Step, { status: number; body: unknown }>>;
}

export const running = () => ({ status: 200, data: { task_status: "running" } });
export const success = (output: unknown[]) => ({
  status: 200,
  data: { task_status: "success", results: { output } },
});
export const failed = (error: string) => ({
  status: 200,
  data: { task_status: "error", error, error_message: `detail for ${error}` },
});

export function sampleOutput() {
  return [
    { type: "acne", ui_score: 72, raw_score: 60.1, mask_urls: ["https://cdn.test/acne.png"] },
    {
      type: "wrinkle",
      region: "whole",
      ui_score: 55,
      raw_score: 40,
      mask_urls: ["https://cdn.test/wrinkle.png", "https://cdn.test/wrinkle-2.png"],
    },
    { type: "wrinkle", region: "forehead", ui_score: 80 },
    { type: "wrinkle", region: "crowfeet", ui_score: 41.6 },
    { type: "pore", ui_score: 90 },
    { type: "texture", raw_score: 57.33, ui_score: 68, mask_urls: ["https://cdn.test/texture.png"] },
    { type: "all", score: 71 },
    { type: "skin_age", score: 27 },
    { type: "brand_new_metric", ui_score: 5 },
  ];
}

/** The normalized result sampleOutput() must produce for acne,wrinkles,pores,texture. */
export const SAMPLE_CONCERNS = [
  { id: "acne", score: 72, severity: 28, level: "mild", maskUrl: "https://cdn.test/acne.png", regions: [] },
  {
    id: "wrinkles",
    score: 55,
    severity: 45,
    level: "moderate",
    maskUrl: "https://cdn.test/wrinkle.png",
    regions: [
      { name: "forehead", score: 80 },
      { name: "crowfeet", score: 42 },
    ],
  },
  { id: "pores", score: 90, severity: 10, level: "none", maskUrl: null, regions: [] },
  { id: "texture", score: 68, severity: 32, level: "mild", maskUrl: "https://cdn.test/texture.png", regions: [] },
];

function stepOf(url: string): Step | "unknown" {
  if (url === `${BASE}/s2s/v2.0/file`) return "file";
  if (url === S3_URL) return "upload";
  if (url === `${BASE}/s2s/v2.1/task/skin-analysis`) return "task";
  if (url.startsWith(`${BASE}/s2s/v2.1/task/skin-analysis/`)) return "poll";
  return "unknown";
}

/** In-memory stand-in for the YouCam API + S3. No network. */
export function fakeYouCam(opts: FakeOptions = {}) {
  const calls: Call[] = [];
  const polls = [...(opts.polls ?? [running(), success(sampleOutput())])];

  const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const step = stepOf(url);
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    calls.push({
      step,
      method: init.method ?? "GET",
      url,
      headers: Object.fromEntries(new Headers(init.headers)),
      rawHeaders: init.headers,
      body,
    });

    const override = step === "unknown" ? undefined : opts.replies?.[step];
    if (override) return Response.json(override.body, { status: override.status });

    switch (step) {
      case "file": {
        const file = body.files[0];
        return Response.json({
          status: 200,
          data: {
            files: [
              {
                file_id: "file-1",
                requests: [
                  {
                    method: "PUT",
                    url: S3_URL,
                    // number on purpose: the provider must send it as a string
                    headers: { "Content-Length": file.file_size, "Content-Type": file.content_type },
                  },
                ],
              },
            ],
          },
        });
      }
      case "upload":
        return new Response(null, { status: 200 });
      case "task":
        return Response.json({ status: 200, data: { task_id: "task-1" } });
      case "poll":
        return Response.json(polls.length > 1 ? polls.shift() : polls[0]);
      default:
        return new Response("not found", { status: 404 });
    }
  }) as typeof fetch;

  const ofStep = (step: Step) => calls.filter((c) => c.step === step);
  return { fetch: fakeFetch, calls, ofStep };
}
