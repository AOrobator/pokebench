import { describe, expect, it } from "vitest";
import { RUN_LOG_MAX_BYTES, fileLines, linesOf } from "./run-log.js";

describe("run logs too long for one string", () => {

  it("splits a whole text and passes a line stream through", () => {
    expect([...linesOf("a\nb\n")]).toEqual(["a", "b", ""]);
    const stream = ["a", "b"];
    expect(linesOf(stream)).toBe(stream);
  });

  it("bounds a run log well above a six-hour run's 1.2 GB", () => {
    expect(RUN_LOG_MAX_BYTES).toBeGreaterThanOrEqual(8 * 1024 ** 3);
    expect(Number.isSafeInteger(RUN_LOG_MAX_BYTES)).toBe(true);
  });

  it("rejects a non-positive chunk size", () => {
    expect(() => [...fileLines("/nonexistent", 0)]).toThrow(/chunk/);
  });
});
