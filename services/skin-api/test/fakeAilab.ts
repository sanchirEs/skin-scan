export const AIL_BASE = "https://ailab.test";
export const AIL_KEY = "ail-test-SECRET-456";
/** 1x1 PNG and a JPEG header: what AILabTools' base64 face_maps start with. */
export const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
export const JPEG_B64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHR8eHR0a";

type Field = string | { name: string; type: string; bytes: Uint8Array };

export interface AilabCall {
  url: string;
  method: string;
  /** Lower-cased header map. */
  headers: Record<string, string>;
  fields: Record<string, Field>;
  signal: AbortSignal | null | undefined;
}

export interface Reply {
  status?: number;
  body: unknown;
}

/** Shape of a failed call per https://www.ailabtools.com/doc/response-description */
export const ailabError = (status: number, code: string, message = `detail for ${code}`): Reply => ({
  status,
  body: {
    request_id: "req-err",
    log_id: "log-err",
    error_code: status,
    error_detail: { status_code: status, code, code_message: code.toLowerCase(), message },
  },
});

const ok = (result: unknown) => ({
  request_id: "req-1",
  log_id: "log-1",
  error_code: 0,
  error_detail: { status_code: 200, code: "", code_message: "", message: "" },
  face_rectangle: { top: 100, left: 120, width: 600, height: 640 },
  result,
});

/** A Skin Analysis Pro success body (fields from the Pro response docs). */
export function proSample(extra: Record<string, unknown> = {}, top: Record<string, unknown> = {}) {
  return {
    ...ok({
      score_info: {
        acne_score: 72,
        wrinkle_score: 55,
        pores_score: 90,
        rough_score: 68,
        melanin_score: 81,
        sensitivity_score: 40,
        oily_intensity_score: 77,
        water_score: 63,
        dark_circle_score: 70,
        blackhead_score: 88,
        skin_type_score: 61,
        total_score: 80,
        pores_type_score: {
          pores_forehead_score: 85,
          pores_leftcheek_score: 92,
          pores_rightcheek_score: 91,
          pores_jaw_score: 92,
        },
        dark_circle_type_score: { left_dark_circle_score: 68, right_dark_circle_score: 72 },
      },
      skin_age: { value: 31 },
      forehead_wrinkle_info: { wrinkle_score: 41, wrinkle_severity_level: 2 },
      glabella_wrinkle_info: { wrinkle_score: 97, wrinkle_severity_level: 0 },
      left_crowsfeet_wrinkle_info: { wrinkle_score: 75, wrinkle_severity_level: 1 },
      eye_pouch: { value: 1, confidence: 0.93 },
      eye_pouch_severity: { value: 0, confidence: 0.81 },
      acne: {
        rectangle: [{ left: 10, top: 20, width: 8, height: 8 }],
        confidence: [0.9],
        polygon: [[{ x: 10, y: 20 }]],
        count: 1,
      },
      face_maps: {
        roi_outline_map: PNG_B64,
        texture_enhanced_lines: JPEG_B64,
        texture_enhanced_pores: "",
        rough_area: PNG_B64,
      },
      ...extra,
    }),
    ...top,
  };
}

/** What proSample() must normalize to for acne,wrinkles,pores,texture. */
export const PRO_CONCERNS = [
  { id: "acne", score: 72, severity: 28, level: "mild", maskUrl: `data:image/png;base64,${PNG_B64}`, regions: [] },
  {
    id: "wrinkles",
    score: 55,
    severity: 45,
    level: "moderate",
    maskUrl: `data:image/jpeg;base64,${JPEG_B64}`,
    regions: [
      { name: "forehead", score: 60 },
      { name: "glabella", score: 95 },
      { name: "leftCrowsFeet", score: 80 },
    ],
  },
  {
    id: "pores",
    score: 90,
    severity: 10,
    level: "none",
    maskUrl: null,
    regions: [
      { name: "forehead", score: 85 },
      { name: "leftCheek", score: 92 },
      { name: "rightCheek", score: 91 },
      { name: "jaw", score: 92 },
    ],
  },
  { id: "texture", score: 68, severity: 32, level: "mild", maskUrl: `data:image/png;base64,${PNG_B64}`, regions: [] },
];

/** A Skin Analysis Advanced success body (categorical fields, no score_info). */
export function advancedSample() {
  return ok({
    skin_age: { value: 28 },
    acne: { rectangle: [{ left: 1, top: 1, width: 5, height: 5 }, { left: 9, top: 9, width: 5, height: 5 }] },
    closed_comedones: { rectangle: [{ left: 3, top: 3, width: 2, height: 2 }] },
    pores_forehead: { value: 1, confidence: 0.9 },
    pores_left_cheek: { value: 0, confidence: 0.8 },
    pores_right_cheek: { value: 0, confidence: 0.8 },
    pores_jaw: { value: 1, confidence: 0.7 },
    forehead_wrinkle: { value: 1, confidence: 0.9 },
    crows_feet: { value: 0, confidence: 0.9 },
    eye_finelines: { value: 1, confidence: 0.9 },
    glabella_wrinkle: { value: 0, confidence: 0.9 },
    nasolabial_fold: { value: 0, confidence: 0.9 },
    eye_pouch: { value: 0, confidence: 0.9 },
  });
}

/** In-memory stand-in for the AILabTools API. No network. An array answers call by call; its last reply repeats. */
export function fakeAilab(reply: Reply | Reply[] = { body: proSample() }) {
  const replies = Array.isArray(reply) ? reply : [reply];
  const calls: AilabCall[] = [];
  const fakeFetch = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const fields: Record<string, Field> = {};
    if (init.body instanceof FormData) {
      for (const [key, value] of init.body) {
        fields[key] =
          typeof value === "string"
            ? value
            : { name: value.name, type: value.type, bytes: new Uint8Array(await value.arrayBuffer()) };
      }
    }
    calls.push({
      url: String(input),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers)),
      fields,
      signal: init.signal,
    });
    const next = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    return Response.json(next.body, { status: next.status ?? 200 });
  }) as typeof fetch;
  return { fetch: fakeFetch, calls };
}
