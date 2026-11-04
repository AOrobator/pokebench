// fixed-point-breaker-v1 and story-character-stall-gate-v1: default OFF, card link and tracked page.
import { expect, it } from "vitest";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS } from "./panels.js";

it("starts auto-talk-v1 and duplicate-turn-collapse-v1 OFF for the next run and links auto-talk to the breaker's explainer", () => {
  expect(DEFAULT_NEXT_RUN.features["auto-talk-v1"]).toBe(false);
  expect(DEFAULT_NEXT_RUN.features["duplicate-turn-collapse-v1"]).toBe(false);
  expect(FEATURE_EXPLAINERS["auto-talk-v1"]).toBe("fixed-point-breaker-v1.html");
});
