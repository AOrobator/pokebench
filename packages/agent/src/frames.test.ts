import { describe, expect, it } from "vitest";
import { FRAME_CAP_BYTES } from "./frames.js";








describe("FrameStore", () => {
  it("defaults to a 10 GB cap", () => {
    expect(FRAME_CAP_BYTES).toBe(10 * 1024 * 1024 * 1024);
  });
});

