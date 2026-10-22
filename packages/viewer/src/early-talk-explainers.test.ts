// auto-talk-field-only-v1, auto-talk-v3 and untalked-people-header-v1: default OFF, card link, tracked page, and the
// quiet-stretch auto_talk line in Activity History.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import { checkEvent } from "@pokebench/agent/events";
import { Log, START } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS, eventText, harnessConfig } from "./panels.js";

for (const [ID, phrase] of [["auto-talk-field-only-v1", "Nothing during a battle"], ["auto-talk-v3", "Ten quiet turns"], ["untalked-people-header-v1", "People on this map you have not talked to since your last story milestone"]] as const) {
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

it("names a quiet-stretch auto-talk in Activity History and keeps the loop wording for the old triggers", () => {
  const body = { v: 1, run: "r", seq: 1, t: "2026-10-22T12:00:00.000-04:00", turn: 1, type: "auto_talk", repeats: 10, outcome: "talked", target: { kind: "person", name: "WOMAN_4", character: null, key: "1/2#4", x: 2, y: 4, map_id: [1, 2] }, walks: 2, tried: 1, text: null };
  expect(eventText(checkEvent({ ...body, trigger: "quiet_map" }))).toBe("Auto-talk after a quiet stretch (10 turns on this map with no story milestone) · talked to WOMAN_4 at (2,4) · 2 walks, 1 tried");
  expect(eventText(checkEvent({ ...body, trigger: "fixed_point" }))).toBe("Loop breaker stage 3 auto-talk (fixed point, 10 in a row) · talked to WOMAN_4 at (2,4) · 2 walks, 1 tried");
});
