export type CameraProblemKind = "denied" | "in-app" | "no-camera" | "insecure" | "unknown";

const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Line\/|TikTok|musical_ly|Snapchat|Twitter|LinkedInApp/i;

export function isInAppBrowser(ua: string): boolean {
  return IN_APP.test(ua);
}

/** Turns a getUserMedia failure into the one explanation the user needs. */
export function cameraErrorKind(err: unknown, ua: string, secure: boolean): CameraProblemKind {
  if (!secure) return "insecure";
  if (isInAppBrowser(ua)) return "in-app";
  const name = err instanceof Error ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") return "no-camera";
  return "unknown";
}

/** Coarse device family for the anonymous scan log. Nothing identifying. */
export function deviceInfo(ua: string): { os: string; browser: string } {
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : "other";
  const browser = /Instagram/i.test(ua)
    ? "Instagram"
    : /FBAN|FBAV/.test(ua)
      ? "Facebook"
      : /SamsungBrowser/.test(ua)
        ? "Samsung Internet"
        : /CriOS|Chrome\//.test(ua)
          ? "Chrome"
          : /FxiOS|Firefox\//.test(ua)
            ? "Firefox"
            : /Safari\//.test(ua)
              ? "Safari"
              : "other";
  return { os, browser };
}
