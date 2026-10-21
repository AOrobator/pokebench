// story-battle-heal-first-v1: default OFF for the next run, card link and tracked page, the line in Activity History (a
// SUPERVISOR step) and nothing new on the closed timeline.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import type { RunEvent } from "@pokebench/agent/events";
import { BASE_MS, Log, START, must } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS, eventText, harnessConfig } from "./panels.js";
import { lanesSvg } from "./timeline.js";
import { TraceBuilder } from "./trace.js";

const ID = "story-battle-heal-first-v1";
const TEXT = "TORCHIC has 5/22 HP. MAY's battle cannot be run from, so heal before talking to her. A boy on ROUTE101 told you: \"There's a POKéMON CENTER in OLDALE TOWN right close by.\" OLDALE TOWN is the SOUTH edge of this map.";
type Body = Extract<Parameters<Log["add"]>[1], { type: "heal_first_line" }>;
const LINE: Body = { type: "heal_first_line", turn: 156, tool: "navigate_to", tool_call_id: "t156", kind: "rival", opponent: "MAY", map_id: [0, 18], party: [{ species: "TORCHIC", hp: 5, max_hp: 22 }],
  heard: { turn: 147, speaker: "the boy you talked to", person: true, place: "ROUTE101", map_id: [0, 16], text: "There's a POKéMON CENTER in OLDALE TOWN right close by." },
  exit: { to: "OLDALE TOWN", map_id: [0, 10], direction: "SOUTH", tiles: [] }, text: TEXT };
const view = (log: Log): RunView => { const v = new RunView(); for (const e of log.events) v.apply(e); return v; };

it("starts OFF for the next run and links its card to the tracked explainer, which carries the probed line", () => {
  expect(DEFAULT_NEXT_RUN.features[ID]).toBe(false);
  expect(FEATURE_EXPLAINERS[ID]).toBe(`${ID}.html`);
  const log = new Log();
  log.add(0, { ...START, harness_features: [ID] });
  const document = new Window().document;
  document.body.innerHTML = harnessConfig(view(log), FEATURES.filter((f) => f.id === ID));
  expect(document.querySelector(`[data-feature="${ID}"] a`)?.getAttribute("href")).toBe(`/explainers/${ID}.html`);
  const html = readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${ID}.html`, import.meta.url)), "utf8");
  expect(html).toContain(ID);
  expect(html).toContain(TEXT);
});

it("is a SUPERVISOR step in Activity History naming the result, the opponent, the party, what was heard and the exit", () => {
  const log = new Log();
  log.add(0, START);
  log.add(100, LINE);
  const builder = new TraceBuilder();
  for (const e of log.events) builder.add(e);
  const step = must(builder.turns.flatMap((t) => t.steps()).find((s) => s.kind === "heal_first_line"));
  expect(step.category).toBe("sup");
  expect(step.titleHtml).toContain("Heal first line");
  const last = (): RunEvent => must(log.events.at(-1));
  expect(eventText(last())).toBe(`Heal first line added to the navigate_to result · MAY · TORCHIC 5/22 · heal line heard turn 147 · exit to OLDALE TOWN · ${TEXT.replace(/"/g, "&quot;").replace(/'/g, "&#39;")}`);
  log.add(200, { ...LINE, heard: null, exit: null, text: "x" });
  expect(eventText(last())).toBe("Heal first line added to the navigate_to result · MAY · TORCHIC 5/22 · no heal line heard · x");
});

it("leaves the line off the timeline (closed to new marks, operator decision 2026-10-16)", () => {
  const log = new Log(); log.add(0, START); log.add(1000, LINE);
  const without = new Log(); without.add(0, START);
  expect(lanesSvg(view(log), BASE_MS + 2000)).toBe(lanesSvg(view(without), BASE_MS + 2000));
  expect(view(log).errors).toEqual([]);
});
