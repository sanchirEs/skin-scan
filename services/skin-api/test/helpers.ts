import type { Logger } from "../src/log.js";

export const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];
export const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes that start like a JPEG; the rest is filler. */
export function fakeJpeg(size = 64, fill = 1): Uint8Array<ArrayBuffer> {
  const img = new Uint8Array(size).fill(fill);
  img.set(JPEG_MAGIC);
  return img;
}

export function fakePng(size = 64): Uint8Array<ArrayBuffer> {
  const img = new Uint8Array(size).fill(2);
  img.set(PNG_MAGIC);
  return img;
}

/** Logger that keeps every line so tests can assert what was (and was not) logged. */
export function memoryLogger() {
  const lines: string[] = [];
  const push = (level: string) => (event: string, meta?: Record<string, unknown>) => {
    lines.push(JSON.stringify({ level, event, ...meta }));
  };
  const logger: Logger = { info: push("info"), warn: push("warn"), error: push("error") };
  return { logger, lines };
}

/** Clock whose sleep() advances time instantly. */
export function fakeClock() {
  let t = 0;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms);
      t += ms;
    },
  };
}
