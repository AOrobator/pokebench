import {recipeText} from "../test-support/recipe-text.js";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { serverFeatureEnv } from "@pokebench/agent/features";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";

const ID = "player-elevation-readout-v1";
it("keeps the next-run default OFF", () => {
 expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
});
for (const {} of ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h", "gym-rustboro-torchic", "gym-rustboro-torchic-healed"]) {
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { main, type FixedCliDeps } from "./fixed-cli.js";
import type { FixedRunOptions } from "./fixed-runner.js";
