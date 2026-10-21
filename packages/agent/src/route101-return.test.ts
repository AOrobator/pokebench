import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import type { GameStateSnapshot } from "./game-state.js";
import type { RunEvent } from "./events.js";
import { MEASUREMENT_ONLY_MILESTONES, MILESTONES, MILESTONE_ORDER, StateMilestones, qualifiedNativeMilestone } from "./milestones.js";

const NAME = "ROUTE_101_AFTER_HANDOFF";
const story = { name_confirmed: true, intro_stage: 7, rival_stage: 4, birch_lab_stage: 0, petalburg_gym_stage: 0, woods_stage: 0, town_stage: 2, clock_set: true, rival_battle_won: false, pokedex_received: false, running_shoes_received: false, starter_tutorial_complete: false, rustboro_gym_complete: false, stone_badge: false, rock_tomb_received: false };
const state = (location: string, lab: number, extra: Partial<GameStateSnapshot> = {}): GameStateSnapshot => ({ screen: "overworld", started: true, name: "X", location, map_id: null, position: { x: 1, y: 1 }, facing: "UP", in_battle: false, party: [], money: 3000, badges: [], play_time_s: 1, story: { ...story, birch_lab_stage: lab }, ...extra });
type StateEvent = Extract<RunEvent, { type: "state" }> & GameStateSnapshot;
const asEvent = (s: GameStateSnapshot, seq: number): StateEvent => ({ ...s, type: "state", run: "r", seq, turn: 1, v: 1, t: "2026-10-15T00:00:00.000-04:00" });
const mark = (evidence: number[], origin: "observed" | "present_at_start" = "observed"): Extract<RunEvent, { type: "milestone" }> => ({ type: "milestone", run: "r", seq: 99, turn: 1, v: 1, t: "2026-10-15T00:00:00.000-04:00", name: NAME, kind: "navigation", origin, evidence, server_timestamp: 1 });
const fired = (tracker: StateMilestones, states: readonly GameStateSnapshot[]) => states.flatMap((s, i) => tracker.observe(s, i + 1)).filter(m => m.name === NAME);

it("sits between the Birch handoff and Oldale as a navigation split that the model never hears about", () => {
  expect(MILESTONE_ORDER.indexOf(NAME)).toBe(MILESTONE_ORDER.indexOf("BIRCH_STARTER_HANDOFF_COMPLETE") + 1);
  expect(MILESTONE_ORDER.indexOf("OLDALE_TOWN")).toBe(MILESTONE_ORDER.indexOf(NAME) + 1);
  expect(MILESTONES.find(m => m.name === NAME)?.kind).toBe("navigation");
  expect([...MEASUREMENT_ONLY_MILESTONES]).toEqual(["ROXANNE_FIRST_INTERACTION","PLAYER_BEDROOM_EXITED_AFTER_CLOCK", NAME, "RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_OLDALE_SEND_OFF", "ROUTE_101_AFTER_RIVAL_BATTLE", "LITTLEROOT_AFTER_RIVAL_BATTLE"]);
});

it("records the first stable Route 101 state after the lab handoff, with pre-handoff, town and route evidence", () => {
  const tracker = new StateMilestones({ read: () => Promise.resolve(state("LITTLEROOT TOWN", 0)) });
  tracker.initialize("boot");
  const before = [
    state("LITTLEROOT TOWN", 0),
    state("ROUTE101", 0),
    state("ROUTE101", 2),
    state("LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 2),
    state("LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 3),
    state("LITTLEROOT TOWN", 3),
    state("LITTLEROOT TOWN", 3, { screen: "unknown" }),
    state("ROUTE101", 3, { screen: "field_transition" }),
    state("ROUTE101", 3, { screen: "unknown" }),
  ];
  expect(fired(tracker, before)).toEqual([]);
  const entered = tracker.observe(state("ROUTE101", 3), 10).filter(m => m.name === NAME);
  expect(entered).toEqual([{ name: NAME, kind: "navigation", origin: "observed", serverTimestamp: expect.any(Number) as number, evidence: [4, 6, 10] }]);
  expect(tracker.observe(state("LITTLEROOT TOWN", 3), 11)).toEqual([]);
  expect(tracker.observe(state("ROUTE101", 3), 12)).toEqual([]);
});

it("also counts a return south from Oldale, and lab stages 4 and 5", () => {
  for (const lab of [3, 4, 5]) {
    const tracker = new StateMilestones({ read: () => Promise.resolve(state("LITTLEROOT TOWN", 0)) });
    expect(fired(tracker, [state("LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 2), state("OLDALE TOWN", lab), state("ROUTE 101", lab)]).map(m => m.evidence)).toEqual([[1, 2, 3]]);
  }
});

it("gives no credit without a pre-handoff witness, from a disconnected map, or before the handoff", () => {
  const onRoute = new StateMilestones({ read: () => Promise.resolve(state("ROUTE101", 3)) });
  onRoute.initialize("save_state");
  expect(fired(onRoute, [state("ROUTE101", 3), state("LITTLEROOT TOWN", 3), state("ROUTE101", 3)])).toEqual([]);
  const inTown = new StateMilestones({ read: () => Promise.resolve(state("LITTLEROOT TOWN", 3)) });
  inTown.initialize("save_state");
  expect(fired(inTown, [state("LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 3), state("LITTLEROOT TOWN", 3), state("ROUTE101", 3)])).toEqual([]);
  const jump = new StateMilestones({ read: () => Promise.resolve(state("LITTLEROOT TOWN", 0)) });
  expect(fired(jump, [state("LITTLEROOT TOWN", 2), state("LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 3), state("ROUTE101", 3)])).toEqual([]);
  const early = new StateMilestones({ read: () => Promise.resolve(state("LITTLEROOT TOWN", 0)) });
  expect(fired(early, [state("LITTLEROOT TOWN", 0), state("ROUTE101", 0), state("ROUTE101", 2), state("LITTLEROOT TOWN", 2), state("ROUTE101", 2)])).toEqual([]);
  const unknownLab = new StateMilestones({ read: () => Promise.resolve(state("LITTLEROOT TOWN", 0)) });
  const blank = { ...story, birch_lab_stage: null };
  expect(fired(unknownLab, [state("LITTLEROOT TOWN", 0, { story: blank }), state("LITTLEROOT TOWN", 3), state("ROUTE101", 3)])).toEqual([]);
});

it("qualifies only the exact three-state transition proof", () => {
  const events = [state("LITTLEROOT TOWN PROFESSOR BIRCHS LAB", 2), state("LITTLEROOT TOWN", 3), state("ROUTE101", 3)].map((s, i) => asEvent(s, i + 1));
  const [witness, town, route] = events;
  if (witness === undefined || town === undefined || route === undefined) throw new Error("fixture");
  expect(qualifiedNativeMilestone(mark([1, 2, 3]), [witness, town, route])).toBe(true);
  expect(qualifiedNativeMilestone(mark([1, 2, 3], "present_at_start"), [witness, town, route])).toBe(false);
  expect(qualifiedNativeMilestone(mark([2, 3]), [town, route])).toBe(false);
  expect(qualifiedNativeMilestone(mark([1, 2, 3]), [{ ...witness, story: { ...story, birch_lab_stage: 3 } }, town, route])).toBe(false);
  expect(qualifiedNativeMilestone(mark([1, 2, 3]), [witness, { ...town, screen: "unknown" }, route])).toBe(false);
  expect(qualifiedNativeMilestone(mark([1, 2, 3]), [witness, { ...town, location: "ROUTE101" }, route])).toBe(false);
  expect(qualifiedNativeMilestone(mark([1, 2, 3]), [witness, { ...town, location: "LITTLEROOT TOWN PROFESSOR BIRCHS LAB" }, route])).toBe(false);
  expect(qualifiedNativeMilestone(mark([1, 2, 3]), [witness, { ...town, story: { ...story, birch_lab_stage: 2 } }, route])).toBe(false);
  expect(qualifiedNativeMilestone(mark([1, 2, 3]), [witness, town, { ...route, screen: "field_transition" }])).toBe(false);
  expect(qualifiedNativeMilestone(mark([1, 2, 3]), [witness, town, { ...route, story: { ...story, birch_lab_stage: 2 } }])).toBe(false);
  expect(qualifiedNativeMilestone(mark([1, 3, 2]), [witness, route, town])).toBe(false);
});

interface Replay { readonly run: string; readonly start: "boot" | "save_state"; readonly states: readonly (readonly [number, string, string, boolean, string | null, [number, number] | null, number | null])[] }
const replays = (JSON.parse(readFileSync(new URL("../test-support/route101-return-replays.json", import.meta.url), "utf8")) as { runs: Replay[] }).runs;
function replay(id: string) {
  const run = replays.find(r => r.run.endsWith(id));
  if (run === undefined) throw new Error(`missing replay ${id}`);
  const tracker = new StateMilestones({ read: () => Promise.reject(new Error("replay only")) });
  tracker.initialize(run.start);
  const marks: { name: string; seq: number; t: string; evidence?: readonly number[] }[] = [];
  for (const [seq, t, screen, started, location, map_id, lab] of run.states) {
    const s = state(location ?? "", lab ?? 0, { screen, started, location, map_id, story: { ...story, birch_lab_stage: lab } });
    for (const m of tracker.observe(s, seq)) marks.push({ name: m.name, seq, t, ...(m.evidence === undefined ? {} : { evidence: m.evidence }) });
  }
  return marks;
}

it("replays recorded runs: 258d earns it at its turn-653 return, c0b8 never re-entered, the human earns it before Oldale", () => {
  const fast = replay("258d");
  expect(fast.filter(m => m.name === NAME)).toEqual([{ name: NAME, seq: 9922, t: "2026-10-15T01:40:43.548-04:00", evidence: [8716, 9405, 9922] }]);
  expect(fast.find(m => m.name === "ROUTE_101")?.seq).toBe(7506);
  expect(replay("c0b8").some(m => m.name === NAME)).toBe(false);
  const human = replay("human_1848");
  const handoff = human.findIndex(m => m.name === "BIRCH_STARTER_HANDOFF_COMPLETE");
  const back = human.findIndex(m => m.name === NAME);
  const oldale = human.findIndex(m => m.name === "OLDALE_TOWN");
  expect(handoff).toBeGreaterThan(-1);
  expect(back).toBeGreaterThan(handoff);
  expect(oldale).toBeGreaterThan(back);
  expect(human[back]).toMatchObject({ seq: 8901, evidence: [expect.any(Number) as number, 8844, 8901] });
});
