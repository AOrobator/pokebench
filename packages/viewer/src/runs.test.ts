import { describe, expect, it } from "vitest";
import { RECENT_EVENT_BYTES, RECENT_EVENT_TURNS } from "./runs.js";




describe("readRecentEvents", () => {
  it("pins the production snapshot bounds", () => {
    expect(RECENT_EVENT_TURNS).toBe(30);
    expect(RECENT_EVENT_BYTES).toBe(8 * 1024 * 1024);
  });
});
