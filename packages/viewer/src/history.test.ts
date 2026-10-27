import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_ON, playHarnessFeatures, type FeatureSet, type SwitchableFeature } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { configOf, featureHistory, type RunConfig } from "./history.js";
import { baselineOf } from "./runs.js";

const off = (...ids: SwitchableFeature[]): FeatureSet => ({ ...ALL_ON, ...Object.fromEntries(ids.map((id) => [id, false])) });
const DRAFT: RunConfig = { model: "qwen", thinking: "medium", maxTokens: 4096, maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3, target: null, features: ALL_ON };

interface Spec { failureLimit?: number; features?: FeatureSet; model?: string; thinking?: string; reason?: string; milestones?: [string, number][]; pauses?: [number, number][]; ended?: boolean; harness?: string[]; boot?: boolean }
function run(root: string, id: string, spec: Spec): void {
  const log = new Log();
  const features = spec.features ?? ALL_ON;
  log.add(0, { ...START, model: { ...START.model, id: spec.model ?? "qwen" }, sampling: { thinking_level: spec.thinking ?? "medium", max_tokens: 4096 }, budgets: { max_turns: 300, max_wall_ms: 1_800_000 }, harness_features: spec.harness ?? playHarnessFeatures(features, null), ...(spec.boot === false ? { start_state: { kind: "save_state", path: "/x.ss1", sha1: "0".repeat(40) } } : {}), ...(spec.failureLimit === undefined ? {} : { evaluation: { preset_id: "p", target: null, failure_limit: spec.failureLimit, flags: { loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true } } }) });
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
    expect(configOf(start)).toEqual({ model: "qwen", thinking: "medium", maxTokens: 4096, maxTurns: 10, maxWallMs: 60_000, failureLimit: 3, target: "RIVAL_MET", features: off("story-state-v1") });
    expect(configOf({ ...start, harness_features: [...start.harness_features, "something-new-v9"] })).toBeNull();
    expect(configOf({ ...start, harness_features: ["probe", ...start.harness_features] })).toBeNull();
    // Measurement-only features change what is recorded, not how the agent plays: a run
    // recorded before one was added (birch-rescue-requested-v1) is still that configuration.
    const before = start.harness_features.filter((id) => id !== "birch-rescue-requested-v1");
    expect(before.length).toBe(start.harness_features.length - 1);
    expect(configOf({ ...start, harness_features: before })).toEqual(configOf(start));
    expect(configOf({ ...start, harness_features: [...before, "something-new-v9"] })).toBeNull();
    expect(configOf({ ...start, harness_features: start.harness_features.filter((id) => id !== "native-target-stop-v1") })).toBeNull();
  });

  it("pairs only runs identical except for the one feature, counting reach and median splits without paused time", async () => {
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
    // An operator abort ends the run; it is not an exclusion. Its earned progress counts.
    sorted(root, "aborted", { features: off("story-state-v1"), reason: "operator_abort", milestones: [["NEW_GAME_CREATED", 1]] });
    // Only the operator's explicit exclusion file removes a run.
    sorted(root, "operator-excluded", { features: off("story-state-v1"), milestones: [["NEW_GAME_CREATED", 2], ["CLOCK_SET", 3]] });
    mkdirSync(join(root, "exclusions"));
    writeFileSync(join(root, "exclusions", "operator-excluded.json"), JSON.stringify({ version: 1, run: "operator-excluded", reason: "wrong ROM", by: "The operator", at: "2026-10-27T20:00:00.000Z" }));
    sorted(root, "live", { features: off("story-state-v1"), ended: false, milestones: [["NEW_GAME_CREATED", 1]] });
    sorted(root, "saved-start", { features: off("story-state-v1"), boot: false, milestones: [["NEW_GAME_CREATED", 1]] });
    sorted(root, "other-failure-limit", { features: off("story-state-v1"), failureLimit: 10, milestones: [["NEW_GAME_CREATED", 1]] });
    const history = (await featureHistory(root, DRAFT));
    expect(history["story-state-v1"]).toEqual({
      on: { runs: 3, reached: { NEW_GAME_CREATED: 3, CLOCK_SET: 2 }, medianMs: { NEW_GAME_CREATED: 40_000, CLOCK_SET: 500_000 } },
      off: { runs: 3, reached: { NEW_GAME_CREATED: 2 }, medianMs: { NEW_GAME_CREATED: 22_500.5 }, stopped: [["NEW_GAME_CREATED"]] },
    });
    expect(history["naming-cursor-v1"]).toBeNull();
    expect(history["deterministic-loop-guard-v1"]).toBeNull();
  });

  it("scores extended runs only through the original active-time horizon and preserves full baselines", async () => {
    const root = mkdtempSync(join(tmpdir(), "history-extension-"));
    const log = new Log();
    log.add(0, { ...START, extend_run: true, model: { ...START.model, id: "qwen" }, sampling: { thinking_level: "medium", max_tokens: 4096 }, budgets: { max_turns: 300, max_wall_ms: 1_800_000 }, harness_features: playHarnessFeatures(ALL_ON, null) });
    log.add(100, { type: "operator_control", turn: 0, action: "extend_30m", status: "applied", request: 1, previous_max_wall_ms: 1_800_000, max_wall_ms: 3_600_000 });
    log.add(1_000, { type: "operator_control", turn: 0, action: "pause", status: "applied", request: 2, emulator_frozen: true });
    log.add(61_000, { type: "operator_control", turn: 0, action: "resume", status: "applied", request: 3, paused_ms: 60_000 });
    for (const [name, ms] of [["NEW_GAME_CREATED", 1_859_999], ["CLOCK_SET", 1_860_000], ["RIVAL_MET", 1_860_001]] as const) {
      log.add(ms, { type: "milestone", turn: 1, name, server_timestamp: ms, kind: "story", origin: "observed" });
    }
    log.add(3_660_000, { type: "run_end", turn: 2, reason: "budget", furthest_milestone: "RIVAL_MET", turns: 2, wall_ms: 3_660_000, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
    const dir = join(root, "extended");
    mkdirSync(dir);
    writeFileSync(join(dir, "events.jsonl"), log.events.map(e => JSON.stringify({ ...e, run: "extended" })).join("\n") + "\n");
    // Both ON runs remain in the denominator even when continuation is their only progress.
    mkdirSync(join(root, "continuation-only"));
    const continuation = log.events.filter(e => e.type !== "milestone" || e.name === "RIVAL_MET");
    writeFileSync(join(root, "continuation-only", "events.jsonl"), continuation.map((e, seq) => JSON.stringify({ ...e, run: "continuation-only", seq })).join("\n") + "\n");
    sorted(root, "off", { features: off("story-state-v1"), milestones: [] });
    const full = baselineOf(root, "extended");
    expect(full.milestones.map(m => [m.name, m.offsetMs])).toEqual([["NEW_GAME_CREATED", 1_799_999], ["CLOCK_SET", 1_800_000], ["RIVAL_MET", 1_800_001]]);
    const history = (await featureHistory(root, DRAFT))["story-state-v1"];
    expect(history).toEqual({ on: { runs: 2, reached: { NEW_GAME_CREATED: 1, CLOCK_SET: 1 }, medianMs: { NEW_GAME_CREATED: 1_799_999, CLOCK_SET: 1_800_000 } }, off: { runs: 1, reached: {}, medianMs: {} } });
    expect(baselineOf(root, "extended")).toEqual(full);
  });

  it("is empty when either arm has no strictly matching run", async () => {
    const root = mkdtempSync(join(tmpdir(), "history-"));
    sorted(root, "on-1", { milestones: [["NEW_GAME_CREATED", 40_000]] });
    expect(Object.values((await featureHistory(root, DRAFT))).every((h) => h === null)).toBe(true);
    expect(Object.values((await featureHistory(join(root, "missing"), DRAFT))).every((h) => h === null)).toBe(true);
  });

  it("uses the draft's value as one arm, whichever way it is switched", async () => {
    const root = mkdtempSync(join(tmpdir(), "history-"));
    sorted(root, "on", { milestones: [["NEW_GAME_CREATED", 1_000]] });
    sorted(root, "off", { features: off("story-state-v1"), milestones: [] });
    const flipped = (await featureHistory(root, { ...DRAFT, features: off("story-state-v1") }));
    expect(flipped["story-state-v1"]?.on.runs).toBe(1);
    expect(flipped["story-state-v1"]?.off.runs).toBe(1);
  });
});

describe("history edge cases", () => {
  it("takes the middle of an even number of splits and skips unreadable runs", async () => {
    const root = mkdtempSync(join(tmpdir(), "history-"));
    sorted(root, "on-1", { milestones: [["NEW_GAME_CREATED", 10_000]] });
    sorted(root, "on-2", { milestones: [["NEW_GAME_CREATED", 30_000]] });
    sorted(root, "off-1", { features: off("story-state-v1"), milestones: [] });
    mkdirSync(join(root, "broken"));
    writeFileSync(join(root, "broken", "events.jsonl"), `${JSON.stringify({ ...new Log().add(0, START), run: "broken", harness_features: playHarnessFeatures(ALL_ON, null) })}\nnot json\n${JSON.stringify({ v: 1, run: "broken", seq: 2, t: "2026-10-11T22:00:01.000-04:00", turn: 0, type: "run_end", reason: "budget", furthest_milestone: null, turns: 0, wall_ms: 1, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } })}\n`);
    expect((await featureHistory(root, DRAFT))["story-state-v1"]?.on).toEqual({ runs: 2, reached: { NEW_GAME_CREATED: 2 }, medianMs: { NEW_GAME_CREATED: 20_000 } });
  });

  it("reads missing budgets as unbounded", () => {
    const log = new Log();
    const start = log.add(0, { ...START, budgets: {}, harness_features: playHarnessFeatures(ALL_ON, null) });
    if (start.type !== "run_start") throw new Error("fixture");
    expect(configOf(start)).toMatchObject({ maxTurns: null, maxWallMs: null, target: null });
  });
});

it("rejects human controller identity even when model and feature settings match a model arm", () => {
  const start = new Log().add(0, { ...START, harness_features: playHarnessFeatures(ALL_ON, null), controller: { kind: "human", name: "Operator", rom_sha1: "c".repeat(40), input_policy: "frame-held-v1", sample_ms: 100, nominal_fps: 59.7275 } });
  if (start.type !== "run_start") throw new Error("fixture");
  expect(configOf(start)).toBeNull();
});

it("keeps human runs out of aggregate feature-history arms even when their model name is spoofed", async () => {
  const root = mkdtempSync(join(tmpdir(), "history-human-"));
  run(root, "model-on", { milestones: [["CLOCK_SET", 100]] });
  run(root, "model-off", { features: off("story-state-v1"), milestones: [] });
  run(root, "human-on", { milestones: [["CLOCK_SET", 1]] });
  const path = join(root, "human-on", "events.jsonl");
  // Identity is controller-owned: a model-like name/config cannot make a human a patch arm.
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const first = JSON.parse(lines[0] ?? "") as Record<string, unknown>;
  lines[0] = JSON.stringify({ ...first, controller: { kind: "human", name: "Operator", rom_sha1: "c".repeat(40), input_policy: "frame-held-v1", sample_ms: 100, nominal_fps: 59.7275 } });
  writeFileSync(path, lines.join("\n") + "\n");
  expect((await featureHistory(root, DRAFT))["story-state-v1"]).toEqual({ on: { runs: 1, reached: { CLOCK_SET: 1 }, medianMs: { CLOCK_SET: 100 } }, off: { runs: 1, reached: {}, medianMs: {} } });
});
