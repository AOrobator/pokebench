import { describe, expect, it } from "vitest";
import { RunView } from "./model.js";
import { nextSplit, reachedSplits, tableSplits } from "./run-splits.js";
import { BASE_MS, START } from "../test-support/events.js";

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

  it("claims no next split for a checkpoint start until it reaches one", () => {
    const resumed = Object.assign(view(), { start: { ...START, start_state: { kind: "save_state", path: "gym.state", sha1: "a".repeat(40) } } });
    expect(nextSplit(resumed, new Set())).toBeUndefined();
    expect(nextSplit(resumed, new Set(["ROXANNE_DEFEATED"]))).toBeDefined();
  });

  it("keeps replay on the folded events so rewinding still hides later splits", () => {
    const recorded = { run: "r", milestones: [] };
    expect(tableSplits("replay", recorded)).toBeUndefined();
    expect(tableSplits("live", recorded)).toBe(recorded);
    expect(tableSplits("loading", null)).toBeNull();
  });
});
