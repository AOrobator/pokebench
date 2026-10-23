// turn-drought-clock-v1 (the operator 2026-10-22): default OFF for the next run, ON in the bundle arm of the two
// bundle-v-control recipes only, registered as a pending experiment, and linked to its tracked explainer.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import { parsePlayPreset, presetFeatures } from "@pokebench/agent/play-preset";
import { Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS, harnessConfig } from "./panels.js";
import { armPreset, controlBaseProblems, parseFixedDefinition } from "./fixed-design.js";

const ID = "turn-drought-clock-v1";
const read = (path: string): string => readFileSync(fileURLToPath(new URL(`../../../${path}`, import.meta.url)), "utf8");

it("starts OFF for the next run and links its card to the tracked explainer", () => {
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
  expect(FEATURE_EXPLAINERS[ID]).toBe(`${ID}.html`);
  const log = new Log();
  log.add(0, { ...START, harness_features: [ID] });
  const view = new RunView();
  for (const event of log.events) view.apply(event);
  const doc = new Window().document;
  doc.body.innerHTML = harnessConfig(view, FEATURES.filter((f) => f.id === ID));
  expect(doc.querySelector(`[data-feature="${ID}"] a`)?.getAttribute("href")).toBe(`/explainers/${ID}.html`);
  const html = read(`docs/explainers/${ID}.html`);
  expect(html).toContain(ID);
  expect(html).toContain("No new story milestone, level-up, trainer win or full heal in the last 30 actions");
});

it("is on only in the bundle arm of the bundle-v-control recipes, appended last, with the control base unchanged", () => {
  for (const name of ["bundle-v-control", "bundle-v-control-2h"]) {
    const { definition } = parseFixedDefinition(read(`experiments/fixed/${name}.json`));
    expect(definition.switches.at(-12), name).toBe(ID);
    expect(definition.base.features[ID], name).toBe(false);
    expect(definition.onInBoth, name).not.toContain(ID);
    expect(definition.offInBoth, name).not.toContain(ID);
    expect(controlBaseProblems(definition, read(definition.controlBase.path)), name).toEqual([]);
    for (const phase of definition.phases) {
      const bundle = presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")));
      expect(bundle[ID], name).toBe(true);
      expect(bundle["stall-briefing-v1"], name).toBe(true);
      expect(presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "control")))[ID], name).toBe(false);
    }
  }
  for (const name of ["bundle-cook-1h", "whole-map-cook-1h", "whole-map-pair-2h", "glm53-flash-4h"]) {
    const { definition } = parseFixedDefinition(read(`experiments/fixed/${name}.json`));
    expect(definition.switches, name).not.toContain(ID);
    for (const phase of definition.phases) expect(presetFeatures(parsePlayPreset(armPreset(definition, phase.id, "bundle")))[ID], name).toBe(false);
  }
});
