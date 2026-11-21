import { createHash } from "node:crypto";
import { makeConcern } from "../normalize.js";
import { CONCERN_IDS, type SkinProvider } from "../types.js";

/**
 * Free, offline provider for app development. Results are fake but deterministic:
 * the same photo always gives the same scores (derived from a SHA-256 of the bytes).
 */
export function createMockProvider(): SkinProvider {
  return {
    name: "mock",
    configured: true,
    async analyze({ image, concerns }) {
      const hash = createHash("sha256").update(image).digest();
      const score = (i: number) => 1 + (hash[i % hash.length]! % 100);

      return {
        provider: "mock",
        concerns: concerns.map((id) => {
          const i = CONCERN_IDS.indexOf(id);
          // One concern with regions, so the app can exercise both shapes.
          const regions =
            id === "wrinkles"
              ? [
                  { name: "forehead", score: score(i + 12) },
                  { name: "crowfeet", score: score(i + 13) },
                ]
              : [];
          return makeConcern(id, score(i), null, regions);
        }),
        skinAge: 18 + (hash[31]! % 40),
        usedSides: false,
      };
    },
  };
}
