import { expect, it } from "vitest";
import { ObjectiveTracker } from "./objectives.js";
import { IN_GAME } from "../test-support/events.js";
import { checkEvent, type RunEvent } from "./events.js";

const envelope = { v: 1 as const, run: "objective_probe", t: "2026-10-12T02:00:00.000-04:00", turn: 1 };
const state = (seq: number, change = {}): Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }> => {
  const event = checkEvent({ ...envelope, seq, type: "state", ...IN_GAME, field_controls_locked: false, party: [], ...change });
  if (event.type !== "state" || !("started" in event)) throw new Error("invalid state fixture");
  return event;
};
const setup = () => {
  const recorded: unknown[] = [];
  const tracker = new ObjectiveTracker("Reach the first gym", (event) => { recorded.push(event); });
  tracker.observe(state(1));
  return { tracker, recorded };
};
const request = { title: "Get a starter", supports_goal: "Progress toward the first gym", evidence: [1], completion: { kind: "state" as const, field: "party_count" as const, value: 1 }, next_decision: "Find the interaction", obstacle: "" };

it("requires observed evidence and an objective before pressing", () => {
  const { tracker } = setup();
  expect(() => { tracker.checkPress(["A"], IN_GAME); }).toThrow(/objective/);
  expect(() => tracker.set({ ...request, evidence: [999] })).toThrow(/evidence/);
  tracker.set(request);
  expect(tracker.snapshot()?.goal).toBe("Reach the first gym");
});

it("checks completion and keeps prior attempts when revised", () => {
  const { tracker } = setup(); tracker.set(request);
  tracker.attempt("press-1", ["A"], state(1), state(2));
  expect(() => tracker.update({ status: "reported_complete", evidence: [1], obstacle: "", next_decision: "Move on", retry_reason: "" })).toThrow(/Completion/);
  tracker.set({ ...request, title: "Find Birch" });
  expect(tracker.attempts).toHaveLength(1);
  expect(tracker.snapshot()?.revision).toBe(2);
});

it("warns after two failures and blocks the third without reassessment", () => {
  const { tracker } = setup(); tracker.set(request);
  tracker.attempt("press-1", ["A"], state(1), state(2));
  tracker.attempt("press-2", ["A"], state(2), state(3));
  expect(tracker.attempts.at(-1)?.warning).toContain("Two");
  expect(() => { tracker.checkPress(["A"], { ...IN_GAME, party: [], field_controls_locked: false }); }).toThrow(/Reassess/);
  expect(() => { tracker.checkPress(["RIGHT"], { ...IN_GAME, party: [], field_controls_locked: false }); }).not.toThrow();
});

it("does not count locked input or editor animation as failure", () => {
  const { tracker } = setup(); tracker.set(request);
  tracker.attempt("press-1", ["A"], state(1, { field_controls_locked: true }), state(2, { field_controls_locked: true }));
  tracker.attempt("press-2", ["A"], state(2, { screen: "naming" }), state(3, { screen: "naming" }));
  expect(tracker.attempts.map((a) => a.outcome)).toEqual(["unavailable", "unavailable"]);
});

it("verifies positive completion from fresh state and rejects stale or visual claims", () => {
  const { tracker } = setup(); tracker.set(request);
  tracker.observe(state(4, { party: IN_GAME.party }));
  const update = { status: "reported_complete" as const, evidence: [4], obstacle: "", next_decision: "Leave town", retry_reason: "" };
  expect(() => tracker.update({ ...update, evidence: [1] })).toThrow(/Completion/);
  expect(tracker.update(update).completion_evidence).toEqual([4]);
  tracker.set({ ...request, completion: { kind: "visual", description: "Clock confirmation closes" } });
  expect(tracker.update(update).status).toBe("reported_complete");
  expect(tracker.update({ ...update, status: "reported_complete" }).status).toBe("reported_complete");
  tracker.set(request);
  expect(tracker.update({ ...update, status: "reported_complete" }).status).toBe("reported_complete");
});

it("requires grounded reassessment and consumes it after one attempt", () => {
  const { tracker } = setup(); tracker.set(request);
  const update = { status: "active" as const, evidence: [1], obstacle: "No interaction", next_decision: "Check facing", retry_reason: "The observed target may need another direction" };
  expect(() => tracker.update(update)).toThrow(/failed attempt/);
  tracker.attempt("p1", ["A"], state(1), state(2));
  tracker.attempt("p2", ["A"], state(2), state(3));
  expect(() => tracker.update(update)).toThrow(/Reassess/);
  tracker.update({ ...update, evidence: [3] });
  expect(() => { tracker.checkPress(["A"], { ...IN_GAME, party: [], field_controls_locked: false, play_time_s: 999 }); }).not.toThrow();
  expect(tracker.attempt("p3", ["A"], state(3), state(4)).retry_justification).toBe(update.retry_reason);
  expect(() => { tracker.checkPress(["A"], { ...IN_GAME, party: [], field_controls_locked: false }); }).toThrow(/Reassess/);
});

it("records movement, turns, state progress and possible cycles distinctly", () => {
  const { tracker } = setup(); tracker.set(request);
  expect(tracker.attempt("p1", ["UP"], state(1), state(2, { facing: "up" })).outcome).toBe("turned");
  expect(tracker.attempt("p2", ["UP"], state(2), state(3, { money: 2000 })).outcome).toBe("progress");
  expect(tracker.attempt("p3", ["UP"], state(3), state(4, { map_id: [0, 101] })).outcome).toBe("moved");
  for (let i = 5; i < 11; i++) tracker.attempt(`p${String(i)}`, ["RIGHT"], state(i, { position: { x: 0, y: 0 } }), state(i + 1, { position: { x: i % 2, y: 1 } }));
  expect(tracker.attempts.at(-1)?.warning).toContain("cycle");
});

it("keeps history on revisions and injects the record after pruning", () => {
  const { tracker, recorded } = setup(); tracker.set(request);
  tracker.attempt("p1", ["A"], state(1), state(2));
  tracker.set({ ...request, title: "Recheck clock" });
  const context = tracker.context([], 123);
  expect(context).toHaveLength(1);
  expect(context[0]?.role).toBe("user");
  expect(JSON.stringify(context)).toContain("p1");
  expect(JSON.stringify(context)).toContain("Recheck clock");
  expect(recorded).toHaveLength(3);
});

it("checks badges, scalar conditions and unique objective identities", () => {
  const { tracker } = setup();
  expect(() => tracker.update({ status: "active", evidence: [1], obstacle: "", next_decision: "Observe", retry_reason: "" })).toThrow(/first/);
  expect(() => tracker.attempt("x", ["A"], state(1), state(2))).toThrow(/No objective/);
  for (const condition of [{ kind: "state" as const, field: "badge" as const, value: "STONE" }, { kind: "state" as const, field: "location" as const, value: IN_GAME.location ?? "" }, { kind: "state" as const, field: "started" as const, value: true }]) {
    tracker.set({ ...request, completion: condition });
    tracker.update({ status: "reported_complete", evidence: [1], obstacle: "", next_decision: "Next goal", retry_reason: "" });
  }
  tracker.set({ ...request, completion: { kind: "visual", description: "Visible message" } });
  const first = tracker.snapshot()?.id;
  tracker.update({ status: "reported_complete", evidence: [1], obstacle: "", next_decision: "Observe", retry_reason: "" });
  expect(tracker.set(request).id).not.toBe(first);
  tracker.update({ status: "blocked", evidence: [1], obstacle: "Cannot move", next_decision: "Observe", retry_reason: "" });
  expect(() => { tracker.checkPress(["A"], IN_GAME); }).toThrow(/active objective/);
});


it("rejects a whitespace-only next decision even with an active objective", () => {
  const { tracker } = setup(); tracker.set({ ...request, next_decision: "   " });
  expect(() => { tracker.checkPress(["A"], state(1)); }).toThrow("Set an active objective and next decision before pressing.");
});

it("isolates absent current state from valid observation evidence", () => {
  const tracker = new ObjectiveTracker("Reach gym", () => undefined);
  tracker.observe({ ...envelope, seq: 1, type: "tool_result", id: "observe", name: "observe", is_error: false, duration_ms: 1, text: "Observed game", frames: [] });
  tracker.set(request);
  expect(() => tracker.update({ status: "reported_complete", evidence: [1], obstacle: "", next_decision: "Next", retry_reason: "" })).toThrow(/Completion is not verified/);
});

it("permits a changed action or material state after matching failures", () => {
  for (const change of [{ screen: "unknown (callback2 0x08134C9D)" }, { map_id: [0, 101] }, { position: { x: 9, y: 8 } }, { facing: "up" }, { field_controls_locked: true }, { local_map: "Changed live target coordinates" }]) {
    const { tracker } = setup(); tracker.set(request);
    tracker.attempt("p1", ["A"], state(1), state(2));tracker.attempt("p2", ["A"], state(2), state(3));
    expect(() => { tracker.checkPress(["A"], state(4, change)); }, JSON.stringify(change)).not.toThrow();
  }
});

it("isolates conservative unavailable-input outcomes", () => {
  for (const change of [{ screen: "unknown" }, { position: null }, { field_controls_locked: true }, { field_controls_locked: null }]) {
    const { tracker } = setup();tracker.set(request);
    expect(tracker.attempt("p", ["A"], state(1, change), state(2, change)).outcome, JSON.stringify(change)).toBe("unavailable");
  }
  const { tracker } = setup(); tracker.set(request);
  expect(tracker.attempt("turn", ["LEFT"], state(1), state(2, { facing: "left" })).outcome).toBe("turned");
  expect(tracker.attempt("x", ["RIGHT"], state(2), state(3, { position: { x: 9, y: 8 } })).outcome).toBe("moved");
  expect(tracker.attempt("y", ["DOWN"], state(3), state(4, { position: { x: 5, y: 9 } })).outcome).toBe("moved");
});


it("records a naming editor change as progress instead of failed movement", () => {
  const { tracker } = setup();tracker.set(request);
  const editing = { screen: "naming", started: false, name: null, location: null, map_id: null, position: null, facing: null, money: null, play_time_s: null, local_map: null, field_controls_locked: null, naming: { text: "A", page: "uppercase", column: 0, row: 0, key: "A", ready: true } };
  expect(tracker.attempt("edit", ["A"], state(1, editing), state(2, { ...editing, naming: { ...editing.naming, text: "AA" } })).outcome).toBe("progress");
});


it("requires actual evidence and ignores elapsed time for repeated-failure matching", () => {
  const { tracker } = setup();
  expect(() => tracker.set({ ...request, evidence: [] })).toThrow(/Cite actual state/);
  tracker.set(request);tracker.attempt("p1", ["A"], state(1), state(2));tracker.attempt("p2", ["A"], state(2), state(3));
  expect(() => { tracker.checkPress(["A"], state(4, { play_time_s: 999 })); }).toThrow(/Two matching attempts/);
});


it("does not treat a blank retry explanation as reassessment", () => {
  const { tracker } = setup();tracker.set(request);tracker.attempt("p1", ["A"], state(1), state(2));tracker.attempt("p2", ["A"], state(2), state(3));
  tracker.update({ status: "active", evidence: [3], obstacle: "No change", next_decision: "Repeat", retry_reason: "   " });
  expect(() => { tracker.checkPress(["A"], state(4)); }).toThrow(/Two matching attempts/);
});


it("explains a value mismatch and exposes all scalar completion facts", () => {
  const { tracker } = setup();
  tracker.set({ ...request, completion: { kind: "state", field: "started", value: false } });
  expect(() => tracker.update({ status: "reported_complete", evidence: [1], obstacle: "", next_decision: "Next", retry_reason: "" })).toThrow('Completion is not verified: field "started" expected false (boolean), observed true (boolean) at state #1. Observe until it matches, or revise the condition with set_objective; a matching local condition is provisional reported_complete, never verified story progress.');
  const content = tracker.context([], 123)[0];
  expect((content?.role === "user" ? content.content : "")).toContain('"started":true');
  expect((content?.role === "user" ? content.content : "")).toContain('"in_battle":false');
  expect((content?.role === "user" ? content.content : "")).toContain('"party_count":0');
});

it("rejects a bad revision without replacing the existing objective", () => {
  const { tracker, recorded } = setup();tracker.set(request);
  const before = tracker.snapshot();
  expect(() => tracker.set({ ...request, completion: { kind: "state", field: "started", value: "true" } })).toThrow(/requires boolean/);
  expect(tracker.snapshot()).toEqual(before);
  expect(recorded).toHaveLength(1);
});


it("keeps historical string boolean objective events readable", () => {
  const event = checkEvent({ ...envelope, seq: 24, type: "objective_update", objective: { ...request, id: "objective-1", revision: 1, goal: "Reach gym", status: "active", completion_evidence: [], completion: { kind: "state", field: "started", value: "true" } } });
  expect(event).toMatchObject({ objective: { completion: { field: "started", value: "true" } } });
});

it("diagnoses stale and absent state evidence separately", () => {
  const { tracker } = setup();tracker.set(request);tracker.observe(state(2));
  const update = { status: "reported_complete" as const, evidence: [1], obstacle: "", next_decision: "Next", retry_reason: "" };
  expect(() => tracker.update(update)).toThrow('Completion is not verified: cite latest state #2; supplied evidence is [1]. Use observe and cite the current state.');
  const empty = new ObjectiveTracker("Reach gym", () => undefined);
  empty.observe({ ...envelope, seq: 1, type: "tool_result", id: "observe", name: "observe", is_error: false, duration_ms: 1, text: "Observed", frames: [] });empty.set(request);
  expect(() => empty.update(update)).toThrow('Completion is not verified: no current game state is available. Use observe, then cite its state evidence.');
  tracker.set({ ...request, completion: { kind: "visual", description: "Screen confirms" } });
  expect(tracker.update({ ...update, evidence: [2] }).status).toBe("reported_complete");
});

it("with the repeat-attempt guard off, records attempts without warnings or blocks", () => {
  const recorded: unknown[] = [];
  const tracker = new ObjectiveTracker("Reach the first gym", (event) => { recorded.push(event); }, { repeatGuard: false, nativeCompletion: true });
  tracker.observe(state(1)); tracker.set(request);
  for (const id of ["p1", "p2", "p3"]) tracker.attempt(id, ["A"], state(1), state(2));
  expect(tracker.attempts.map((a) => [a.outcome, a.failure_count, a.warning])).toEqual([["no_change", 1, null], ["no_change", 2, null], ["no_change", 3, null]]);
  expect(() => { tracker.checkPress(["A"], { ...IN_GAME, party: [], field_controls_locked: false }); }).not.toThrow();
  for (const [id, x] of [["m1", 1], ["m2", 2], ["m3", 1], ["m4", 2], ["m5", 1]] as const) tracker.attempt(id, ["UP"], state(5, { position: { x: x === 1 ? 2 : 1, y: 1 } }), state(6, { position: { x, y: 1 } }));
  expect(tracker.attempts.every((a) => a.warning === null)).toBe(true);
});
