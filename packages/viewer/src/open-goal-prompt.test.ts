// open-goal-prompt-v1 in the viewer: default OFF for the next run, and its card links a tracked
// explainer that carries the pre-registered Rustboro-before-mention diagnostic.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS, harnessConfig } from "./panels.js";

const ID = "open-goal-prompt-v1";

it("starts OFF for the next run", () => {
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
});

it("links the open goal card to its tracked explainer with the diagnostic to watch", () => {
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
  expect(html).toContain("LAB (Rustboro City)");
  expect(html).toContain("25 of 67 runs");
  expect(html).toContain("Your goal is to play the game and make as much story progress as you can; the people in the game will tell you what to do next.");
});
