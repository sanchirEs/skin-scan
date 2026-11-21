const ERRORS = {
  bad_image: [400, "Send the photo as raw JPEG or PNG bytes with a matching Content-Type."],
  origin_not_allowed: [403, "This origin is not allowed to call the API."],
  not_found: [404, "Not found."],
  too_large: [413, "The photo is too large."],
  no_face: [422, "No face was found in the photo."],
  face_too_small: [422, "The face is too small or not fully in the frame. Move closer and center your face."],
  too_dark: [422, "The photo is too dark. Try again in better light."],
  pose: [422, "Please look straight at the camera."],
  image_too_small: [422, "The photo resolution is too low."],
  rate_limited: [429, "Too many requests. Please wait a minute and try again."],
  internal_error: [500, "Something went wrong."],
  provider_error: [502, "The skin analysis service failed. Please try again later."],
  not_configured: [503, "Skin analysis is not configured on the server."],
  timeout: [504, "The skin analysis took too long. Please try again."],
} as const;

export type ErrorCode = keyof typeof ERRORS;
export type ErrorStatus = (typeof ERRORS)[ErrorCode][0];

/** Diagnostics for the server log only; never sent to the client. Must not hold secrets or image bytes. */
export interface FailureDetail {
  /** Which provider call failed, e.g. "file", "poll", "analyze". */
  step?: string;
  /** HTTP status the provider answered with. */
  providerStatus?: number;
  /** The provider's own error code (or a socket error code like ECONNRESET). */
  providerCode?: string;
  providerMessage?: string;
}

/** An error the client is meant to see, rendered as {"error": code, "message": text}. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;
  readonly detail: FailureDetail;

  constructor(code: ErrorCode, message?: string, detail: FailureDetail = {}) {
    super(message ?? ERRORS[code][1]);
    this.name = "ApiError";
    this.code = code;
    this.status = ERRORS[code][0];
    this.detail = detail;
  }

  toJSON() {
    return { error: this.code, message: this.message };
  }
}

/** Turn a fetch() rejection into an ApiError: our time budget ran out -> timeout, anything else -> provider_error. */
export function fetchFailure(err: unknown, step: string): ApiError {
  const name = err instanceof Error ? err.name : "unknown";
  if (name === "TimeoutError" || name === "AbortError") {
    return new ApiError("timeout", undefined, { step, providerCode: name });
  }
  // undici puts the socket error (ENOTFOUND, ECONNRESET, ...) in `cause`. Never log err.message: it can echo headers.
  const cause = err instanceof Error ? (err.cause as { code?: unknown } | undefined)?.code : undefined;
  return new ApiError("provider_error", undefined, { step, providerCode: typeof cause === "string" ? cause : name });
}
