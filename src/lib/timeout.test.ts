import { describe, expect, it } from "vitest";
import { TimeoutError, withTimeout } from "./timeout";

describe("withTimeout", () => {
  it("passes a fast result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });

  it("rejects a promise that never settles", async () => {
    await expect(withTimeout(new Promise(() => {}), 20)).rejects.toBeInstanceOf(TimeoutError);
  });
});
