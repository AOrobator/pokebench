import { expect, it } from "vitest";
import { objectiveGameTools, objectiveTools } from "./objective-tools.js";
import { ObjectiveTracker } from "./objectives.js";
import { IN_GAME } from "../test-support/events.js";
import type { RunEvent } from "./events.js";
import type { GameStateSnapshot } from "./game-state.js";

type StateEvent = Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }>;
const envelope = { v: 1 as const, run: "objective_tools", t: "2026-10-12T02:00:00.000-04:00", turn: 1 };
const game = { ...IN_GAME, party: [], field_controls_locked: false };
const request = { title: "Get starter", supports_goal: "Reach gym", evidence: [0], completion: { kind: "state", field: "party_count", value: 1 }, obstacle: "", next_decision: "Interact" };
function setup() {
  let seq = 0;
  const events: RunEvent[] = [];
  const tracker = new ObjectiveTracker("Reach gym", () => undefined);
  const recorder = {
    recordState: (state: GameStateSnapshot): StateEvent => { const e = { ...envelope, seq: seq++, type: "state" as const, ...state }; events.push(e); tracker.observe(e); return e; },
    buttonPress: () => undefined,
    afterPress: () => Promise.resolve(),
  };
  recorder.recordState(game);
  return { tracker, recorder, events };
}
function serving() {
  let actions = 0;
  const bytes = Buffer.alloc(33); Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(bytes); bytes.write("IHDR",12);bytes.writeUInt32BE(240,16);bytes.writeUInt32BE(160,20);
  const fetchFn: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: unknown;
    if (url.endsWith("/action")) { actions++; body = { status: "success" }; }
    else if (url.endsWith("/queue_status")) body = { queue_empty: true };
    else if (url.endsWith("/pokebench/state")) body = game;
    else body = { state: game, state_text: "Player at (5,8)", screenshot_base64: bytes.toString("base64") };
    return Promise.resolve(new Response(JSON.stringify(body)));
  };
  return { fetchFn, actions: () => actions };
}

it("offers validated objective tools and separates completion from reports", async () => {
  const { tracker } = setup(); const tools = objectiveTools(tracker);
  const get = tools.find((t) => t.name === "get_objectives");
  const set = tools.find((t) => t.name === "set_objective");
  const update = tools.find((t) => t.name === "update_objective");
  if (get === undefined || set === undefined || update === undefined) throw new Error("missing tools");
  expect(JSON.stringify(await get.execute("g", {}))).toContain("Reach gym");
  await expect(set.execute("s", { ...request, evidence: [500] })).rejects.toThrow(/evidence/);
  await expect(set.execute("s", { title: "not enough" })).rejects.toThrow(/parameters/);
  await set.execute("s", request);
  await expect(update.execute("u", {})).rejects.toThrow(/update/);
  await update.execute("u", { status: "blocked", evidence: [0], obstacle: "No response", next_decision: "Observe", retry_reason: "" });
  expect(tracker.snapshot()?.status).toBe("blocked");
});

it("injects coherent observation evidence, records attempts and prevents the third action", async () => {
  const { tracker, recorder, events } = setup(); const server = serving();
  const tools = objectiveGameTools(tracker, recorder, "http://127.0.0.1:8812", server.fetchFn);
  const observe = tools.find((t) => t.name === "observe"); const press = tools.find((t) => t.name === "press");
  if (observe === undefined || press === undefined) throw new Error("missing tools");
  await observe.execute("o", {});
  expect(events.at(-1)).toMatchObject({ type: "state", position: game.position });
  await expect(press.execute("p0", { buttons: ["A"] })).rejects.toThrow(/objective/);
  expect(server.actions()).toBe(0);
  tracker.set({ ...request, completion: { kind: "state", field: "party_count", value: 1 } });
  await expect(press.execute("bad", { buttons: ["INVALID"] })).rejects.toThrow(/parameters/);
  await press.execute("p1", { buttons: ["A"] });
  const second = await press.execute("p2", { buttons: ["A"] });
  expect(JSON.stringify(second)).toContain("reassessment required");
  expect(tracker.attempts).toHaveLength(2);
  await expect(press.execute("p3", { buttons: ["A"] })).rejects.toThrow(/Reassess/);
  expect(server.actions()).toBe(2);
  const controller = new AbortController(); controller.abort();
  await expect(press.execute("abort", { buttons: ["RIGHT"] }, controller.signal)).rejects.toThrow();
  expect(server.actions()).toBe(2);
});

it("refreshes completion evidence and rejects a cached successful condition", async () => {
  const { tracker, recorder } = setup();
  recorder.recordState({ ...game, party: IN_GAME.party });
  tracker.set({ ...request, completion: { kind: "state", field: "party_count", value: 1 } });
  const tools = objectiveTools(tracker, () => Promise.resolve(recorder.recordState(game).seq));
  const update = tools.find((t) => t.name === "update_objective"); if (update === undefined) throw new Error("missing update");
  await expect(update.execute("u", { status: "completed", evidence: [1], obstacle: "", next_decision: "Next", retry_reason: "" })).rejects.toThrow(/Completion/);
  expect(tracker.snapshot()?.status).toBe("active");
});

it("records unavailable outcomes when a submitted press fails", async () => {
  const { tracker, recorder } = setup();tracker.set({ ...request, completion: { kind: "state", field: "party_count", value: 1 } });
  const server = serving();
  const fetchFn: typeof fetch = (input, options) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/action")) return Promise.resolve(new Response("{}", { status: 500 }));
    return server.fetchFn(input, options);
  };
  const press = objectiveGameTools(tracker, recorder, "http://127.0.0.1:8812", fetchFn).find((t) => t.name === "press");
  if (press === undefined) throw new Error("missing press");
  await expect(press.execute("p", { buttons: ["A"] })).rejects.toThrow(/POST/);
  expect(tracker.attempts.at(-1)).toMatchObject({ after_seq: null, outcome: "unavailable", failure_count: 0 });
});
