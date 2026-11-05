import { describe, expect, it } from "vitest";
import { RunView } from "./model.js";
import { nextSplit, reachedSplits, tableSplits } from "./run-splits.js";
import { FRONTIER_MILESTONES } from "./frontier.js";
import { BROWSER_MODULES } from "./browser-modules.js";
import { BASE_MS, START, must } from "../test-support/events.js";

const view = (): RunView => Object.assign(new RunView(), { start: START, startMs: BASE_MS });

describe("the one source of a run's reached splits", () => {
  it("reads recorded splits when they are given, even though a current view has no milestones", () => {
    const recorded = { run: "r", milestones: [{ name: "NEW_GAME_CREATED", offsetMs: 30_000 }, { name: "CLOCK_SET", offsetMs: 90_000, derived: true }] };
    expect(reachedSplits(view(), recorded)).toEqual([{ name: "NEW_GAME_CREATED", at: 30, derived: false }, { name: "CLOCK_SET", at: 90, derived: true }]);
  });

  it("falls back to the folded events without counting what the start state already had", () => {
    const folded = view();
    folded.milestones.push({ name: "GAME_RUNNING", ms: BASE_MS + 2000, seq: 1 }, { name: "CLOCK_SET", ms: BASE_MS, seq: 2, origin: "present_at_start" });
    expect(reachedSplits(folded, undefined)).toEqual([{ name: "GAME_RUNNING", at: 2, derived: false }]);
    expect(reachedSplits(new RunView(), undefined)).toEqual([]);
  });

  it("names the frontier milestone after the deepest one reached", () => {
    expect(nextSplit(view(), new Set())).toBe("NEW_GAME_CREATED");
    expect(nextSplit(view(), new Set(["NEW_GAME_CREATED"]))).not.toBe("NEW_GAME_CREATED");
    expect(nextSplit(new RunView(), new Set())).toBe("NEW_GAME_CREATED");
  });

  it("starts from where the save began, and claims nothing for an unknown save", () => {
    const from = (path: string): RunView => Object.assign(view(), { start: { ...START, start_state: { kind: "save_state", path, sha1: "a".repeat(40) } } });
    const first = must(FRONTIER_MILESTONES[0]).id, second = must(FRONTIER_MILESTONES[1]).id, third = must(FRONTIER_MILESTONES[2]).id;
    expect(nextSplit(from("x/MAIN_MENU.state"), new Set())).toBe(first);
    expect(nextSplit(from(`x/${first}.state`), new Set(["ROUTE_102_TRAINER_CALVIN_DEFEATED"]))).toBe(second);
    expect(nextSplit(from(`x/${first}.state`), new Set([second]))).toBe(third);
    expect(nextSplit(from("x/custom.state"), new Set())).toBeUndefined();
    expect(nextSplit(from("x/custom.state"), new Set(["ROUTE_102_TRAINER_CALVIN_DEFEATED"]))).toBeUndefined();
    expect(nextSplit(from("x/custom.state"), new Set([first]))).toBe(second);
    expect(nextSplit(from("custom.state"), new Set())).toBeUndefined();
  });

  it("is served to the browser, which imports it from the panels", () => {
    expect(BROWSER_MODULES).toContain("run-splits");
  });

  it("keeps replay on the folded events so rewinding still hides later splits", () => {
    const recorded = { run: "r", milestones: [] };
    expect(tableSplits("replay", recorded)).toBeUndefined();
    expect(tableSplits("live", recorded)).toBe(recorded);
    expect(tableSplits("loading", null)).toBeNull();
  });
});
