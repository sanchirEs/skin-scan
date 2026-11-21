import type { ImageType } from "./types.js";

const MAGIC: Record<ImageType, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
};

/** What the bytes actually are (JPEG or PNG), or null. */
export function detectImageType(bytes: Uint8Array): ImageType | null {
  for (const type of ["image/jpeg", "image/png"] as const) {
    if (MAGIC[type].every((byte, i) => bytes[i] === byte)) return type;
  }
  return null;
}
