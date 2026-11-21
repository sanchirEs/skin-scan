import { describe, expect, it } from "vitest";
import { cameraErrorKind, deviceInfo } from "./camera-support";

const err = (name: string) => Object.assign(new Error(name), { name });
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile Safari/604.1";
const INSTAGRAM = `${SAFARI} Instagram 350.0.0.0`;
const FACEBOOK = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36 [FBAN/EMA;FBAV/400.0]";

describe("cameraErrorKind", () => {
  it("reads a refused permission as denied", () => {
    expect(cameraErrorKind(err("NotAllowedError"), SAFARI, true)).toBe("denied");
  });

  it("blames the in-app browser whatever the error", () => {
    expect(cameraErrorKind(err("NotAllowedError"), INSTAGRAM, true)).toBe("in-app");
    expect(cameraErrorKind(err("TypeError"), FACEBOOK, true)).toBe("in-app");
  });

  it("reads a missing device as no camera", () => {
    expect(cameraErrorKind(err("NotFoundError"), SAFARI, true)).toBe("no-camera");
    expect(cameraErrorKind(err("OverconstrainedError"), SAFARI, true)).toBe("no-camera");
  });

  it("reads an http page as insecure", () => {
    expect(cameraErrorKind(err("TypeError"), SAFARI, false)).toBe("insecure");
  });

  it("falls back to unknown", () => {
    expect(cameraErrorKind(err("NotReadableError"), SAFARI, true)).toBe("unknown");
  });
});

describe("deviceInfo", () => {
  it("names the phone OS and browser family only", () => {
    expect(deviceInfo(SAFARI)).toEqual({ os: "iOS", browser: "Safari" });
    expect(deviceInfo(INSTAGRAM)).toEqual({ os: "iOS", browser: "Instagram" });
  });
});
