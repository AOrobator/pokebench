// trainer-sight-check-v1: default OFF for the next run, card link and tracked page, and the server route that serves it.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS, harnessConfig } from "./panels.js";

const ID = "trainer-sight-check-v1";

it("starts trainer-sight-check-v1 OFF for the next run and links its card to the tracked explainer", () => {
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
  expect(html).toContain("- object 3, sprite YOUNGSTER at (3,9) (loaded, its tile now), facing LEFT, sight 3 tiles: it can see (1,9), step 12 of 23 on the route.");
});
