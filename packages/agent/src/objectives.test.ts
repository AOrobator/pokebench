import { expect, it } from "vitest";
import { ObjectiveTracker } from "./objectives.js";
import { IN_GAME } from "../test-support/events.js";
import type { RunEvent } from "./events.js";

const envelope = { v: 1 as const, run: "objective_probe", t: "2026-10-12T02:00:00.000-04:00", turn: 1 };
const state = (seq: number, change = {}): Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }> => ({ ...envelope, seq, type: "state", ...IN_GAME, field_controls_locked: false, party: [], ...change });
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
  expect(() => tracker.update({ status: "completed", evidence: [1], obstacle: "", next_decision: "Move on", retry_reason: "" })).toThrow(/Completion/);
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
  const update = { status: "completed" as const, evidence: [4], obstacle: "", next_decision: "Leave town", retry_reason: "" };
  expect(() => tracker.update({ ...update, evidence: [1] })).toThrow(/Completion/);
  expect(tracker.update(update).completion_evidence).toEqual([4]);
  tracker.set({ ...request, completion: { kind: "visual", description: "Clock confirmation closes" } });
  expect(() => tracker.update(update)).toThrow(/Completion/);
  expect(tracker.update({ ...update, status: "reported_complete" }).status).toBe("reported_complete");
  tracker.set(request);
  expect(() => tracker.update({ ...update, status: "reported_complete" })).toThrow(/State-backed/);
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
    tracker.update({ status: "completed", evidence: [1], obstacle: "", next_decision: "Next goal", retry_reason: "" });
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
  expect(() => tracker.update({ status: "completed", evidence: [1], obstacle: "", next_decision: "Next", retry_reason: "" })).toThrow(/Completion is not verified/);
});

it("permits a changed action or material state after matching failures", () => {
  for (const change of [{ map_id: [0, 101] }, { position: { x: 9, y: 8 } }, { facing: "up" }, { field_controls_locked: true }, { naming: { text: "A", page: "uppercase", row: 0, column: 0, key: "A", ready: true } }, { local_map: "Changed live target coordinates" }]) {
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
