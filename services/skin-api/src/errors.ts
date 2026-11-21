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

/** An error the client is meant to see, rendered as {"error": code, "message": text}. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: ErrorStatus;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? ERRORS[code][1]);
    this.name = "ApiError";
    this.code = code;
    this.status = ERRORS[code][0];
  }

  toJSON() {
    return { error: this.code, message: this.message };
  }
}
