import { describe, expect, it } from "vitest";
import { run } from "../test-support/frontier-run.js";
import { parseWorkbench, type WorkbenchRun, type WorkbenchSplit } from "./workbench-data.js";
import { parseSaveSidecar, readSaveProvenance, resolveOrigins, sidecarPath, type SaveProvenance, type SaveStart } from "./frontier-origin.js";

const SHA = "c".repeat(40);
const split = (name: string, turn: number): WorkbenchSplit => ({ name, elapsedMs: turn * 1000, segmentMs: 0, seq: turn, turn, inputTokens: 0, outputTokens: 0 });
const source = (id: string, splits: readonly WorkbenchSplit[], overrides: Partial<WorkbenchRun> = {}): WorkbenchRun => run({ id, splits: [...splits], ...overrides });
const save = (file: string, restoration: SaveStart["restoration"] = null): SaveStart => ({ path: `/Users/user/dev/pokebench/runs/source/checkpoints/${file}`, sha1: SHA, restoration });
const saved = (id: string): WorkbenchRun => { const base = run({ id }); if (base.config === null) throw new Error("fixture"); return { ...base, config: { ...base.config, start: "save_state", resume: null } }; };
const origin = (runs: readonly WorkbenchRun[], start: SaveStart, provenance: SaveProvenance | null): ReturnType<typeof resolveOrigins> => resolveOrigins(runs, new Map([["resumed", start]]), () => provenance);

describe("placing a save by provenance", () => {
  it("places an ee2a-shaped manual save at the source's furthest milestone at or before the save's turn", () => {
    const paused = source("5f0f", [split("STONE_BADGE", 400), split("FORTREE_CITY", 1920), split("FORTREE_GYM_ENTERED", 2100), split("FEATHER_BADGE", 2500)]);
    const sidecar = parseSaveSidecar({ version: 1, run: "5f0f", kind: "manual_save", sha1: SHA, turn: 2181 }, SHA);
    expect(origin([paused, saved("resumed")], save("PAUSED_BEFORE_RESTART.state"), sidecar).get("resumed")).toEqual({ milestone: "FORTREE_GYM_ENTERED", save: "PAUSED_BEFORE_RESTART.state", sourceRun: "5f0f", sourceTurn: 2181 });
  });
  it("ranks by the story order, not by the order the source reached milestones", () => {
    const paused = source("source", [split("FORTREE_GYM_ENTERED", 10), split("STONE_BADGE", 20)]);
    expect(origin([paused], save("x.state"), { run: "source", turn: 50 }).get("resumed")?.milestone).toBe("FORTREE_GYM_ENTERED");
  });
  it("counts a milestone reached on the save's own turn and ignores screenshot-only evidence", () => {
    const paused = source("source", [split("STONE_BADGE", 5), { ...split("FEATHER_BADGE", 5), screenshotEvidence: [] }]);
    expect(origin([paused], save("x.state"), { run: "source", turn: 5 }).get("resumed")?.milestone).toBe("STONE_BADGE");
  });
  it("uses a save file named after a frontier milestone without needing provenance", () => {
    expect(origin([], save("RUSTBORO_GYM_TRAINER_JOSH_DEFEATED.state"), null).get("resumed")).toEqual({ milestone: "RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", save: "RUSTBORO_GYM_TRAINER_JOSH_DEFEATED.state", sourceRun: null, sourceTurn: null });
  });
  it("falls back to the run's restoration binding when there is no sidecar", () => {
    const paused = source("source", [split("STONE_BADGE", 5)]);
    expect(origin([paused], save("continuation.state", { source_run: "source", source_turn: 9 }), null).get("resumed")).toEqual({ milestone: "STONE_BADGE", save: "continuation.state", sourceRun: "source", sourceTurn: 9 });
  });
  it("leaves the origin unknown with no provenance, an unloaded source or no turn, keeping what is known", () => {
    expect(origin([], save("checkpoint.state"), null).get("resumed")).toEqual({ milestone: null, save: "checkpoint.state", sourceRun: null, sourceTurn: null });
    expect(origin([], save("x.state"), { run: "gone", turn: 3 }).get("resumed")).toEqual({ milestone: null, save: "x.state", sourceRun: "gone", sourceTurn: 3 });
    expect(origin([source("source", [split("STONE_BADGE", 1)])], save("x.state"), { run: "source", turn: null }).get("resumed")?.milestone).toBeNull();
  });
  it("uses the source's own start when it reached nothing yet, through a chain of saves", () => {
    const config = saved("named").config; if (config === null) throw new Error("fixture");
    const named = source("named", [], { config: { ...config, resume: "CLOCK_SET" } });
    expect(origin([named], save("x.state"), { run: "named", turn: 1 }).get("resumed")?.milestone).toBe("CLOCK_SET");
    const root = source("root", [split("STONE_BADGE", 1)]), middle = saved("middle");
    const origins = resolveOrigins([root, middle], new Map([["middle", save("a.state")], ["resumed", save("b.state")]]), start => start.path.endsWith("a.state") ? { run: "root", turn: 1 } : { run: "middle", turn: 1 });
    expect(origins.get("resumed")?.milestone).toBe("STONE_BADGE");
  });
  it("prefers the source's later progress over its own start", () => {
    const config = saved("named").config; if (config === null) throw new Error("fixture");
    const named = source("named", [split("STONE_BADGE", 2)], { config: { ...config, resume: "CLOCK_SET" } });
    expect(origin([named], save("x.state"), { run: "named", turn: 2 }).get("resumed")?.milestone).toBe("STONE_BADGE");
  });
  it("survives a provenance cycle", () => {
    const origins = resolveOrigins([saved("a"), saved("b")], new Map([["a", save("a.state")], ["b", save("b.state")]]), start => start.path.endsWith("a.state") ? { run: "b", turn: 1 } : { run: "a", turn: 1 });
    expect(origins.get("a")?.milestone).toBeNull();
    expect(origins.get("b")?.milestone).toBeNull();
  });
});

describe("save sidecars", () => {
  it("reads the three recorded shapes", () => {
    expect(parseSaveSidecar({ run: "a", turn: 7, sha1: SHA }, SHA)).toEqual({ run: "a", turn: 7 });
    expect(parseSaveSidecar({ run: "a", milestone_event: { turn: 8 }, state: { sha1: SHA } }, SHA)).toEqual({ run: "a", turn: 8 });
    expect(parseSaveSidecar({ source_run: "a", source_turn: 9, sha1: SHA }, SHA)).toEqual({ run: "a", turn: 9 });
  });
  it("keeps a source with no usable turn", () => {
    expect(parseSaveSidecar({ run: "a", turn: "late", sha1: SHA }, SHA)).toEqual({ run: "a", turn: null });
  });
  it("rejects a sidecar for a different save, with no hash, or with no source", () => {
    expect(parseSaveSidecar({ run: "a", turn: 7, sha1: "d".repeat(40) }, SHA)).toBeNull();
    expect(parseSaveSidecar({ run: "a", state: { sha1: "d".repeat(40) } }, SHA)).toBeNull();
    expect(parseSaveSidecar({ turn: 7, sha1: SHA }, SHA)).toBeNull();
    expect(parseSaveSidecar({ run: "a", turn: 7 }, SHA)).toBeNull();
    expect(parseSaveSidecar("nope", SHA)).toBeNull();
  });
  it("re-roots a save path under the store root, whichever checkout recorded it", () => {
    expect(sidecarPath("/data/runs", "/tmp/other-checkout/runs/5f0f/checkpoints/PAUSED.state")).toBe("/data/runs/5f0f/checkpoints/PAUSED.json");
  });
  it("refuses a path outside a runs folder, a traversal or a file that is not a save", () => {
    expect(sidecarPath("/data/runs", "/saves/PAUSED.state")).toBeNull();
    expect(sidecarPath("/data/runs", "/x/runs/../../etc/PAUSED.state")).toBeNull();
    expect(sidecarPath("/data/runs", "/x/runs/a/PAUSED.bin")).toBeNull();
  });
  it("treats unreadable or malformed sidecars as no provenance", () => {
    const start = save("x.state");
    expect(readSaveProvenance("/data/runs", start, () => null)).toBeNull();
    expect(readSaveProvenance("/data/runs", start, () => "{not json")).toBeNull();
    expect(readSaveProvenance("/data/runs", { ...start, path: "/saves/x.state" }, () => { throw new Error("must not read"); })).toBeNull();
    const asked: string[] = [];
    expect(readSaveProvenance("/data/runs", start, path => { asked.push(path); return JSON.stringify({ run: "a", turn: 2, sha1: SHA }); })).toEqual({ run: "a", turn: 2 });
    expect(asked).toEqual(["/data/runs/source/checkpoints/x.json"]);
  });
});

describe("the origin on the wire", () => {
  const data = (origin: unknown): unknown => ({ version: 1, at: 0, milestones: [], problems: [], runs: [{ ...run(), origin }] });
  it("rejects malformed probe splits", () => {
    expect(() => parseWorkbench({ version: 1, at: 0, milestones: [], problems: [], runs: [{ ...run(), probeSplits: [{ name: 3 }] }] })).toThrow();
  });
  it("accepts a recorded origin and rejects a malformed one", () => {
    expect(parseWorkbench(data({ milestone: null, save: "x.state", sourceRun: null, sourceTurn: null })).runs[0]?.origin?.save).toBe("x.state");
    expect(() => parseWorkbench(data({ milestone: 3, save: "x.state", sourceRun: null, sourceTurn: null }))).toThrow();
  });
});
