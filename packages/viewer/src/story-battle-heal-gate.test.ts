// story-battle-heal-gate-v1: default OFF for the next run, card link and tracked page, the server route that serves it,
// the decision in Activity History (a SUPERVISOR step) and nothing new on the closed timeline.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { afterEach, expect, it } from "vitest";
import { FEATURES } from "@pokebench/agent/features";
import type { RunEvent } from "@pokebench/agent/events";
import { BASE_MS, Log, START, must } from "../test-support/events.js";
import { RunView } from "./model.js";
import { DEFAULT_NEXT_RUN } from "./next-run.js";
import { FEATURE_EXPLAINERS, eventText, harnessConfig } from "./panels.js";
import { startViewer } from "./server.js";
import { lanesSvg } from "./timeline.js";
import { TraceBuilder } from "./trace.js";

const ID = "story-battle-heal-gate-v1";
const TEXT = "Battle not started: talking to your rival MAY (object 2, at (10,3)) starts a trainer battle, and your party is not at full HP: TORCHIC 5/22.";
type GateBody = Extract<Parameters<Log["add"]>[1], { type: "story_battle_heal_gate" }>;
const GATE: GateBody = { type: "story_battle_heal_gate", turn: 157, tool_call_id: "t157", tool: "navigate_to_target", map_id: [0, 18], confirmed: false, outcome: "refused", reason: null,
  reached: [{ kind: "rival", name: "MAY", local_id: 2, sprite_kind: "RIVAL_MAY_NORMAL", x: 10, y: 3, loaded: true, via: "talk", tile: { x: 14, y: 10 } }], sightings: [], hurt: [{ species: "TORCHIC", hp: 5, max_hp: 22 }],
  heal: [{ kind: "pokemon_center", town: "OLDALE TOWN", map_id: [2, 2], hops: 2, shown: true }], text: TEXT };
const MAY = must(GATE.reached[0]);
const view = (log: Log): RunView => { const v = new RunView(); for (const e of log.events) v.apply(e); return v; };
const open: { close(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(open.splice(0).map((v) => v.close())); });

it("starts OFF for the next run and links its card to the tracked explainer, which carries the 97a0 text", () => {
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

it("serves the explainer byte for byte", async () => {
  const tracked = readFileSync(fileURLToPath(new URL(`../../../docs/explainers/${ID}.html`, import.meta.url)));
  const root = mkdtempSync(join(tmpdir(), "pokebench-explainers-")), staticDir = join(root, "packages/viewer/static"), docs = join(root, "docs/explainers");
  mkdirSync(staticDir, { recursive: true }); mkdirSync(docs, { recursive: true }); writeFileSync(join(docs, `${ID}.html`), tracked);
  const viewer = await startViewer({ runsRoot: join(root, "runs"), staticDir, appDir: join(root, "app"), port: 0 }); open.push(viewer);
  const reply = await fetch(`http://127.0.0.1:${String(viewer.port)}/explainers/${ID}.html`);
  expect(reply.status).toBe(200);
  expect(Buffer.from(await reply.arrayBuffer()).equals(tracked)).toBe(true);
});

it("is a SUPERVISOR step in Activity History naming the call, the outcome, the opponent and the party", () => {
  const log = new Log();
  log.add(0, START);
  log.add(100, GATE);
  const builder = new TraceBuilder();
  for (const e of log.events) builder.add(e);
  const step = must(builder.turns.flatMap((t) => t.steps()).find((s) => s.kind === "story_battle_heal_gate"));
  expect(step.category).toBe("sup");
  expect(step.titleHtml).toContain("Story battle heal gate");
  const last = (): RunEvent => must(log.events.at(-1));
  expect(eventText(last())).toBe(`Story battle heal gate (navigate_to_target) · not started · rival MAY at (10,3) talked to · TORCHIC 5/22 · ${TEXT}`);
  log.add(200, { ...GATE, tool: "navigate_to", confirmed: true, outcome: "confirmed", text: null, reached: [{ ...MAY, kind: "gym_leader", name: "ROXANNE", via: "approach", tile: { x: 5, y: 3 } }],
    sightings: [{ local_id: 3, sprite_kind: "YOUNGSTER", trainer_id: 321, x: 3, y: 9, facing: "LEFT", sight: 3, loaded: true, step: 12, tile: { x: 1, y: 9 }, from: { x: 3, y: 9 }, seen_facing: "LEFT" }] });
  expect(eventText(last())).toBe("Story battle heal gate (navigate_to, confirm) · started anyway · Gym Leader ROXANNE at (10,3) approached from (5,3) · object 3 YOUNGSTER at (3,9) sees (1,9) · TORCHIC 5/22");
  log.add(300, { ...GATE, tool: "press", outcome: "clear", text: null, reached: [] });
  expect(eventText(last())).toBe("Story battle heal gate (press) · no trainer battle ahead · TORCHIC 5/22");
  log.add(400, { ...GATE, tool: "navigate_to", outcome: "unavailable", reason: "map grid unreadable", text: null, reached: [{ ...MAY, kind: "gym_trainer", name: null, sprite_kind: null }] });
  expect(eventText(last())).toBe("Story battle heal gate (navigate_to) · sight not checked: map grid unreadable · object 2 unknown at (10,3) talked to · TORCHIC 5/22");
  log.add(500, { ...GATE, outcome: "unavailable", reason: null, text: null, reached: [{ ...MAY, name: null }], sightings: [{ local_id: 9, sprite_kind: null, trainer_id: 1, x: 0, y: 0, facing: "UP", sight: 1, loaded: false, step: 1, tile: { x: 0, y: 1 }, from: { x: 0, y: 0 }, seen_facing: "UP" }] });
  expect(eventText(last())).toBe("Story battle heal gate (navigate_to_target) · sight not checked: unknown · rival unknown at (10,3) talked to · object 9 unknown at (0,0) sees (0,1) · TORCHIC 5/22");
  log.add(600, { ...GATE, reached: [{ ...MAY, kind: "gym_leader", name: null }] });
  expect(eventText(last())).toContain("Gym Leader unknown at (10,3)");
});

it("leaves gate decisions off the timeline (closed to new marks, operator decision 2026-10-16)", () => {
  const log = new Log(); log.add(0, START); log.add(1000, GATE);
  const without = new Log(); without.add(0, START);
  expect(lanesSvg(view(log), BASE_MS + 2000)).toBe(lanesSvg(view(without), BASE_MS + 2000));
  expect(view(log).errors).toEqual([]);
});
