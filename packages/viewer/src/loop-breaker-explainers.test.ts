// fixed-point-breaker-v1 and story-character-stall-gate-v1: default OFF, card link and tracked page.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS, harnessConfig } from "./panels.js";

for (const [] of [["fixed-point-breaker-v1", "Stage 3: walk to the nearest untalked person and press A"], ["story-character-stall-gate-v1", "The turn 450 note, off and on"], ["positive-supervisor-v1", "The same note, off and on"]] as const) {
}

it("starts auto-talk-v1 and duplicate-turn-collapse-v1 OFF for the next run and links auto-talk to the breaker's explainer", () => {
  expect(DEFAULT_NEXT_RUN.features["auto-talk-v1"]).toBe(false);
  expect(DEFAULT_NEXT_RUN.features["duplicate-turn-collapse-v1"]).toBe(false);
  expect(FEATURE_EXPLAINERS["auto-talk-v1"]).toBe("fixed-point-breaker-v1.html");
});
