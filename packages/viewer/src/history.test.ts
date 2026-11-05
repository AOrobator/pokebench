import { describe, expect, it } from "vitest";
import { ALL_ON, playHarnessFeatures, type FeatureSet, type SwitchableFeature } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { configOf, poolableConfig } from "./history.js";

const off = (...ids: SwitchableFeature[]): FeatureSet => ({ ...ALL_ON, ...Object.fromEntries(ids.map((id) => [id, false])) });


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
});

describe("history edge cases", () => {

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

it("keeps custom lanes out of the per-switch history", () => {
  const start = new Log().add(0, { ...START, harness_features: playHarnessFeatures(ALL_ON, null) });
  if (start.type !== "run_start") throw new Error("fixture");
  const plain = { ...start, harness_features: start.harness_features.filter((id) => id !== "rq-milestone-guide-v1" && id !== "story-route-plan-v1" && id !== "next-milestone-hint-v1" && id !== "objective-graph-supervisor-v1") };
  expect(poolableConfig(plain)).toEqual(configOf(plain));
  expect(poolableConfig({ ...plain, model: { ...plain.model, id: "qwen-edit-e1" } })).toBeNull();
  expect(poolableConfig({ ...plain, harness_features: [...plain.harness_features, "story-route-plan-v1"] })).toBeNull();
});
