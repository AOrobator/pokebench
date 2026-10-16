import { describe, expect, it } from "vitest";
import { IN_GAME } from "../test-support/events.js";
import { ALL_ON, type FeatureSet } from "./features.js";
import type { GameStateSnapshot } from "./game-state.js";
import { toolSwitches } from "./play-config.js";
import { ALL_PRESS_FACTS, ShownStates, pressResult } from "./press-result.js";

const TRANSITIONS = { ...ALL_PRESS_FACTS, transitions: true };
const BUNDLE = { ...TRANSITIONS, warpArrival: true };
const field: GameStateSnapshot = { ...IN_GAME, screen: "overworld", field_controls_locked: false };
const town = (x: number, y: number, facing: string, locked: boolean): GameStateSnapshot => ({ ...field, location: "LITTLEROOT TOWN", map_id: [0, 9], position: { x, y }, facing, field_controls_locked: locked });
const lab: GameStateSnapshot = { ...field, location: "LITTLEROOT TOWN PROFESSOR BIRCHS LAB", map_id: [1, 4], position: { x: 6, y: 12 }, facing: "up" };
const shownAfter = (...states: GameStateSnapshot[]): ShownStates => {
  const shown = new ShownStates();
  for (const state of states) shown.record(state);
  return shown;
};

// 2026-10-15T23-47-41_qwen36-gpu0_2919 T185: before seq 2875 (9,17); today's capture seq 2884
// (7,16) locked mid door animation; the settled arrival is seq 2900, LAB (6,12) unlocked.
describe("T185: LEFT, LEFT, UP through Birch's lab door (control-2919)", () => {
  const before = town(9, 17, "left", false);
  const midDoor = town(7, 16, "up", true);
  it("reports the warp once the observation settles on the arrival", () => {
    expect(pressResult(before, lab, ["LEFT", "LEFT", "UP"], BUNDLE, shownAfter(before))).toBe(
      "warped during this press: LITTLEROOT TOWN [map 0/9] (9,17) -> LITTLEROOT TOWN PROFESSOR BIRCHS LAB [map 1/4] (6,12)",
    );
  });
  it("today's mid-animation capture read as a move (the model never learned it entered)", () => {
    expect(pressResult(before, midDoor, ["LEFT", "LEFT", "UP"], ALL_PRESS_FACTS)).toBe("moved (9,17) -> (7,16)");
  });
  it("without transition press results the settled arrival reads as today's bare transition", () => {
    expect(pressResult(before, lab, ["LEFT", "LEFT", "UP"], { ...ALL_PRESS_FACTS, warpArrival: true })).toBe("transitioned (map or screen changed)");
  });
});

// 2026-10-15T23-47-41_qwen36-gpu1_3f21 T157 (bundle bug 9): last shown seq 3125 (7,16) locked
// in the doorway; the press's before snapshot seq 3133 was mid map load (field_transition
// active_ui, no position); after seq 3140 LAB (6,12).
describe("bundle bug 9: an active interface owner must not hide the warp (bundle-3f21 T157)", () => {
  const doorway = town(7, 16, "up", true);
  const loading: GameStateSnapshot = { ...field, screen: "field_transition", location: null, map_id: null, position: null, facing: null, field_controls_locked: null, active_ui: { phase: "field_transition", selected: null, ready: false, controls: "Map load in progress; field input is not active", diagnostic: null, value: null, details: null } };
  it("names the warp from the last state shown", () => {
    expect(pressResult(loading, lab, ["UP"], BUNDLE, shownAfter(doorway))).toBe(
      "warped during this press (the map change was already under way when it began): LITTLEROOT TOWN [map 0/9] (7,16) -> LITTLEROOT TOWN PROFESSOR BIRCHS LAB [map 1/4] (6,12)",
    );
  });
  it("is today's interface change when the switch is off", () => {
    const today = "interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)";
    expect(pressResult(loading, lab, ["UP"], TRANSITIONS, shownAfter(doorway))).toBe(today);
    expect(pressResult(loading, lab, ["UP"], { ...BUNDLE, transitions: false }, shownAfter(doorway))).toBe(today);
  });
  it("reports a warp between placed snapshots whatever interface owner either one had", () => {
    const owner = { phase: "field_message", selected: null, ready: true, controls: "A advances", diagnostic: null, value: null, details: null };
    const before = { ...town(7, 17, "up", false), active_ui: owner };
    expect(pressResult(before, lab, ["UP"], BUNDLE, shownAfter(before))).toBe(
      "warped during this press: LITTLEROOT TOWN [map 0/9] (7,17) -> LITTLEROOT TOWN PROFESSOR BIRCHS LAB [map 1/4] (6,12)",
    );
    expect(pressResult(town(7, 17, "up", false), { ...lab, active_ui: owner }, ["UP"], BUNDLE)).toContain("warped during this press: LITTLEROOT TOWN [map 0/9] (7,17) -> ");
    expect(pressResult(before, lab, ["UP"], TRANSITIONS, shownAfter(before))).toBe("interface changed (phase, selection, value, or readiness changed; input acceptance per frame unproven)");
  });
  it("adds nothing when no map changed or nothing placed was shown", () => {
    expect(pressResult(loading, lab, ["UP"], BUNDLE, shownAfter(lab))).not.toContain("warped");
    expect(pressResult(loading, lab, ["UP"], BUNDLE, new ShownStates())).not.toContain("warped");
    expect(pressResult({ ...loading, screen: "battle" }, lab, ["UP"], BUNDLE, shownAfter(doorway))).not.toContain("warped");
    expect(pressResult(loading, loading, ["UP"], BUNDLE, shownAfter(doorway))).not.toContain("warped");
    expect(pressResult(town(7, 17, "up", false), town(7, 16, "up", false), ["UP"], BUNDLE)).toBe("moved (7,17) -> (7,16)");
  });
  it("still reports a state coverage error as unavailable", () => {
    const broken = { ...lab, active_ui: { phase: "x", selected: null, ready: null, controls: "", diagnostic: "unsupported", value: null, details: null } };
    expect(pressResult(town(7, 17, "up", false), broken, ["UP"], BUNDLE)).toBe("unavailable (state coverage error; no verified interface outcome)");
  });
});

describe("warp-arrival-settle-v1 production wiring", () => {
  it("passes the switch from the feature set to the press result", () => {
    const features: FeatureSet = { ...ALL_ON, "warp-arrival-settle-v1": true };
    expect(toolSwitches(features).warpArrival).toBe(true);
    expect(toolSwitches({ ...features, "warp-arrival-settle-v1": false }).warpArrival).toBe(false);
  });
});
