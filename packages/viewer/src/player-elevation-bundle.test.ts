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
for (const name of ["bundle-v-control", "bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "bundle-v-control-2h", "gym-rustboro-torchic", "gym-rustboro-torchic-healed"]) {
 it(`${name}: normalized bundle alone enables player elevation at the server seam`, () => {
  const { definition } = parseFixedDefinition(recipeText(new URL(`../../../experiments/fixed/${name}.json`, import.meta.url),"utf8"));
  expect(controlBaseProblems(definition, recipeText(new URL(`../../../${definition.controlBase.path}`, import.meta.url),"utf8"))).toEqual([]);
  for (const phase of definition.phases) {
   for (const arm of ["control", "bundle"] as const) {
    const features = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, arm)));
    expect(features[ID]).toBe(arm === "bundle");
    expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",").includes(ID)).toBe(arm === "control");
   }
  }
 });
}

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { main, type FixedCliDeps } from "./fixed-cli.js";
import type { FixedRunOptions } from "./fixed-runner.js";

it.each([
 { name: "bundle-v-control-2h", lane: "B", wall: "86400000", recipe: [] },
 { name: "glm53-flash-4h", lane: "A", wall: "604800000", recipe: ["--feature-recipe", "bundle-v-control"] },
])("$name: the single-arm CLI hands effective elevation bits to the injected runner", async ({ name, lane, wall, recipe }) => {
 const root = mkdtempSync(join(tmpdir(), "elevation-cli-"));
 try {
  const starts = new Map<string, string>();
  for (const id of ["bundle-v-control-2h", "bundle-v-control", "glm53-flash-4h"]) {
   const path = `experiments/fixed/${id}.json`, text = recipeText(new URL(`../../../${path}`, import.meta.url),"utf8");
   const { definition } = parseFixedDefinition(text);
   mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
   const base = definition.controlBase.path; mkdirSync(dirname(join(root, base)), { recursive: true });
   writeFileSync(join(root, base), readFileSync(new URL(`../../../${base}`, import.meta.url)));
   for (const phase of definition.phases) if (phase.start.kind === "save_state") starts.set(join(root, phase.start.path), phase.start.sha1);
  }
  const runs: FixedRunOptions[] = [], errors: string[] = [];
  const rom = "/offline/identity-only.rom", romHash = "f3ae088181bf583e55daf962a92bb46f4f1d07b7";
  const deps: FixedCliDeps = {
   root, runsRoot: join(root, "runs"), out: () => undefined, err: s => { errors.push(s); },
   randomSeed: () => "feedfacefeedface", interactive: false, prompt: () => Promise.resolve(""),
   now: () => new Date("2026-10-24T15:00:00Z"), user: "offline-fixture", head: () => "0".repeat(40),
   sha1File: p => p === rom ? romHash : starts.get(p) ?? null, rom,
   run: options => { runs.push(options); return Promise.resolve("finished"); }, host: () => ({}) as never,
  };
  for (const arm of ["bundle", "control"] as const) {
   expect(await main(["dry-run", name, "--phase", "cook", "--wall-ms", wall, ...recipe, "--arm", arm, "--lane", lane], deps), errors.join("\n")).toBe(0);
   const options = runs.at(-1); if (options === undefined) throw new Error("injected runner not called");
   expect(options.dryRun).toBe(true); expect(options.runsRoot).toBe(join(root, "runs"));
   expect(options.def.plan).toHaveLength(1); expect(options.def.plan[0]).toMatchObject({ arm, lane });
   const phase = options.def.phases[0]; if (phase === undefined) throw new Error("effective phase missing");
   expect(phase.maxWallMs).toBe(Number(wall));
   const features = presetFeatures(parsePlayPreset(armPreset(options.def, phase.id, arm)));
   expect(features[ID]).toBe(arm === "bundle");
   expect(serverFeatureEnv(features).POKEBENCH_FEATURES_OFF.split(",").includes(ID)).toBe(arm === "control");
  }
  expect(runs).toHaveLength(2); expect(errors).toEqual([]);
 } finally { rmSync(root, { recursive: true, force: true }); }
});
