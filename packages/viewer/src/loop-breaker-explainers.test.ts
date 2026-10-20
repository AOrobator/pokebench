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

for (const [ID, phrase] of [["fixed-point-breaker-v1", "Stage 3: walk to the nearest untalked person and press A"], ["story-character-stall-gate-v1", "The turn 450 note, off and on"]] as const) {
  it(`starts ${ID} OFF for the next run and links its card to the tracked explainer`, () => {
    expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
    expect(FEATURE_EXPLAINERS[ID]).toBe(`${ID}.html`);
    const log = new Log();
    log.add(0, { ...START, harness_features: [ID] });
    const doc = new Window().document;
    const view = new RunView();
    for (const event of log.events) view.apply(event);
    doc.body.innerHTML = harnessConfig(view, FEATURES.filter((f) => f.id === ID));
    expect(doc.querySelector(`[data-feature="${ID}"] a`)?.getAttribute("href")).toBe(`/explainers/${ID}.html`);
    const html = readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${ID}.html`, import.meta.url)), "utf8");
    expect(html).toContain(ID);
    expect(html).toContain(phrase);
  });
}
