import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_ON, playHarnessFeatures, type FeatureSet, type SwitchableFeature } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { configOf, featureHistory, type RunConfig } from "./history.js";

const off = (...ids: SwitchableFeature[]): FeatureSet => ({ ...ALL_ON, ...Object.fromEntries(ids.map((id) => [id, false])) });
const DRAFT: RunConfig = { model: "qwen", thinking: "medium", maxTokens: 4096, maxTurns: 300, maxWallMs: 1_800_000, target: null, features: ALL_ON };

interface Spec { features?: FeatureSet; model?: string; thinking?: string; reason?: string; milestones?: [string, number][]; pauses?: [number, number][]; ended?: boolean; harness?: string[]; boot?: boolean }
function run(root: string, id: string, spec: Spec): void {
  const log = new Log();
  const features = spec.features ?? ALL_ON;
  log.add(0, { ...START, model: { ...START.model, id: spec.model ?? "qwen" }, sampling: { thinking_level: spec.thinking ?? "medium", max_tokens: 4096 }, budgets: { max_turns: 300, max_wall_ms: 1_800_000 }, harness_features: spec.harness ?? playHarnessFeatures(features, null), ...(spec.boot === false ? { start_state: { kind: "save_state", path: "/x.ss1", sha1: "0".repeat(40) } } : {}) });
  let request = 1;
  for (const [from, to] of spec.pauses ?? []) {
    log.add(from, { type: "operator_control", turn: 1, action: "pause", status: "applied", request: request++, emulator_frozen: true });
    log.add(to, { type: "operator_control", turn: 1, action: "resume", status: "applied", request: request++, paused_ms: to - from });
  }
  for (const [name, ms] of spec.milestones ?? []) log.add(ms, { type: "milestone", turn: 1, name, server_timestamp: ms, kind: "story", origin: "observed" });
  if (spec.ended !== false) log.add(900_000, { type: "run_end", turn: 2, reason: (spec.reason ?? "budget") as "budget", furthest_milestone: null, turns: 2, wall_ms: 900_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
  const dir = join(root, id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "events.jsonl"), log.events.map((e) => JSON.stringify({ ...e, run: id })).join("\n") + "\n");
}
const sorted = (root: string, id: string, spec: Spec): void => { run(root, id, spec); };

describe("strict per-feature history", () => {
  it("reads a run's configuration from its run_start", () => {
    const log = new Log();
    const start = log.add(0, { ...START, model: { ...START.model, id: "qwen" }, harness_features: playHarnessFeatures(off("story-state-v1"), "RIVAL_MET"), evaluation: { preset_id: "p", target: "RIVAL_MET", failure_limit: 3, flags: { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true } } });
    if (start.type !== "run_start") throw new Error("fixture");
    expect(configOf(start)).toEqual({ model: "qwen", thinking: "medium", maxTokens: 4096, maxTurns: 10, maxWallMs: 60_000, target: "RIVAL_MET", features: off("story-state-v1") });
    expect(configOf({ ...start, harness_features: [...start.harness_features, "something-new-v9"] })).toBeNull();
    expect(configOf({ ...start, harness_features: ["probe", ...start.harness_features] })).toBeNull();
  });

  it("pairs only runs identical except for the one feature, counting reach and median splits without paused time", () => {
    const root = mkdtempSync(join(tmpdir(), "history-"));
    sorted(root, "on-1", { milestones: [["NEW_GAME_CREATED", 40_000], ["CLOCK_SET", 600_000]] });
    sorted(root, "on-2", { milestones: [["NEW_GAME_CREATED", 50_000]], pauses: [[10_000, 30_000]] });
    sorted(root, "on-3", { milestones: [["NEW_GAME_CREATED", 60_000], ["CLOCK_SET", 400_000]], reason: "operator_stop" });
    sorted(root, "off-1", { features: off("story-state-v1"), milestones: [["NEW_GAME_CREATED", 45_000]] });
    sorted(root, "off-2", { features: off("story-state-v1"), milestones: [] });
    // Near misses that must not count.
    sorted(root, "other-model", { features: off("story-state-v1"), model: "swarm", milestones: [["NEW_GAME_CREATED", 1]] });
    sorted(root, "other-thinking", { features: off("story-state-v1"), thinking: "high", milestones: [["NEW_GAME_CREATED", 1]] });
    sorted(root, "two-features", { features: off("story-state-v1", "naming-cursor-v1"), milestones: [["NEW_GAME_CREATED", 1]] });
    sorted(root, "aborted", { features: off("story-state-v1"), reason: "operator_abort", milestones: [["NEW_GAME_CREATED", 1]] });
    sorted(root, "live", { features: off("story-state-v1"), ended: false, milestones: [["NEW_GAME_CREATED", 1]] });
    sorted(root, "saved-start", { features: off("story-state-v1"), boot: false, milestones: [["NEW_GAME_CREATED", 1]] });
    const history = featureHistory(root, DRAFT);
    expect(history["story-state-v1"]).toEqual({
      on: { runs: 3, reached: { NEW_GAME_CREATED: 3, CLOCK_SET: 2 }, medianMs: { NEW_GAME_CREATED: 40_000, CLOCK_SET: 500_000 } },
      off: { runs: 2, reached: { NEW_GAME_CREATED: 1 }, medianMs: { NEW_GAME_CREATED: 45_000 } },
    });
    expect(history["naming-cursor-v1"]).toBeNull();
    expect(history["deterministic-loop-guard-v1"]).toBeNull();
  });

  it("is empty when either arm has no strictly matching run", () => {
    const root = mkdtempSync(join(tmpdir(), "history-"));
    sorted(root, "on-1", { milestones: [["NEW_GAME_CREATED", 40_000]] });
    expect(Object.values(featureHistory(root, DRAFT)).every((h) => h === null)).toBe(true);
    expect(Object.values(featureHistory(join(root, "missing"), DRAFT)).every((h) => h === null)).toBe(true);
  });

  it("uses the draft's value as one arm, whichever way it is switched", () => {
    const root = mkdtempSync(join(tmpdir(), "history-"));
    sorted(root, "on", { milestones: [["NEW_GAME_CREATED", 1_000]] });
    sorted(root, "off", { features: off("story-state-v1"), milestones: [] });
    const flipped = featureHistory(root, { ...DRAFT, features: off("story-state-v1") });
    expect(flipped["story-state-v1"]?.on.runs).toBe(1);
    expect(flipped["story-state-v1"]?.off.runs).toBe(1);
  });
});

describe("history edge cases", () => {
  it("takes the middle of an even number of splits and skips unreadable runs", () => {
    const root = mkdtempSync(join(tmpdir(), "history-"));
    sorted(root, "on-1", { milestones: [["NEW_GAME_CREATED", 10_000]] });
    sorted(root, "on-2", { milestones: [["NEW_GAME_CREATED", 30_000]] });
    sorted(root, "off-1", { features: off("story-state-v1"), milestones: [] });
    mkdirSync(join(root, "broken"));
    writeFileSync(join(root, "broken", "events.jsonl"), `${JSON.stringify({ ...new Log().add(0, START), run: "broken", harness_features: playHarnessFeatures(ALL_ON, null) })}\nnot json\n${JSON.stringify({ v: 1, run: "broken", seq: 2, t: "2026-10-11T22:00:01.000-04:00", turn: 0, type: "run_end", reason: "budget", furthest_milestone: null, turns: 0, wall_ms: 1, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } })}\n`);
    expect(featureHistory(root, DRAFT)["story-state-v1"]?.on).toEqual({ runs: 2, reached: { NEW_GAME_CREATED: 2 }, medianMs: { NEW_GAME_CREATED: 20_000 } });
  });

  it("reads missing budgets as unbounded", () => {
    const log = new Log();
    const start = log.add(0, { ...START, budgets: {}, harness_features: playHarnessFeatures(ALL_ON, null) });
    if (start.type !== "run_start") throw new Error("fixture");
    expect(configOf(start)).toMatchObject({ maxTurns: null, maxWallMs: null, target: null });
  });
});
