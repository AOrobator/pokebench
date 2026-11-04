import { describe, expect, it } from "vitest";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

// the operator 2026-10-22 (frontier report fixes): each switch default off and on in the bundle arm; control keeps it off.
const SWITCHES = [
  ["away-note-buildings-v1", "harness-trust-v1"],
  ["current-map-display-name-v1", "semantic-current-map-feedback-v1"],
  ["window-escape-route-v1", "bounded-navigation-v1"],
] as const;

describe("frontier report fixes bundle activation", () => {
  it("are off in the next-run defaults", () => {
    for (const [id] of SWITCHES) expect(DEFAULT_NEXT_RUN.features[id]).toBe(false);
  });
});
