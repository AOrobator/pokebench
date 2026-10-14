import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { applyHistoricalProvenance } from "./frontier-provenance.js";
import type { RecordingMeasurement } from "./frontier-recording.js";
function setup(): { root: string; folder: string; run: Parameters<typeof applyHistoricalProvenance>[1]; plan: object } {
  const root = mkdtempSync(join(tmpdir(), "frontier-provenance-")), folder = join(root, "launch-receipts", "cohort"); mkdirSync(folder, { recursive: true });
  const measurement: RecordingMeasurement = { controller: "agent", features: ["named", "astar"], logSha256: "a".repeat(64), pausedMs: 0, rawSplits: [] };
  const run = { id: "actual", cohort: null, model: "alias", measurement, config: { source: "a".repeat(40), preset: "astar", maxTurns: 1500, maxWallMs: 1800000, failureLimit: 3, thinking: "medium", maxTokens: 4096, features: [{ id: "astar", on: true }, { id: "topology", on: null }, { id: "later", on: null }] } };
  const plan = { source: run.config.source, order: ["astar"], presets: { astar: { id: "astar", limits: { maxTurns: 1500, maxWallMs: 1800000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: { named: true, astar: true, topology: false } } } };
  writeFileSync(join(folder, "plan.json"), JSON.stringify(plan)); writeFileSync(join(folder, "trials.jsonl"), JSON.stringify({ type: "launch", run: "actual", trial: 1, arm: "astar" }) + "\n");
  return { root, folder, run, plan };
}
it("binds explicit historical OFF flags and retained artifact to run/source/preset/features instead of preset-name inference", () => {
  const { root, folder, run } = setup(); writeFileSync(join(folder, "serving-model.json"), JSON.stringify({ id: "alias", metadata: { upstream_model_id: "recorded-artifact" } }));
  applyHistoricalProvenance(root, run); expect(run.cohort).toBe("cohort"); expect(run.config?.features.find(f => f.id === "topology")?.on).toBe(false); expect(run.config?.features.find(f => f.id === "later")?.on).toBeNull();
  expect(run.measurement?.artifact).toMatchObject({ id: "recorded-artifact" }); expect(run.measurement?.receipts).toHaveLength(2);
});
it("refuses drift, ambiguous launches, malformed receipts, unknown artifact aliases and a different cohort", () => {
  const mismatch = setup(); if (mismatch.run.measurement !== undefined) mismatch.run.measurement.features.push("topology"); applyHistoricalProvenance(mismatch.root, mismatch.run); expect(mismatch.run.cohort).toBeNull();
  const ambiguous = setup(); writeFileSync(join(ambiguous.folder, "trials.jsonl"), Array(2).fill(JSON.stringify({ type: "launch", run: "actual", trial: 1, arm: "astar" })).join("\n")); applyHistoricalProvenance(ambiguous.root, ambiguous.run); expect(ambiguous.run.cohort).toBeNull();
  const malformed = setup(); writeFileSync(join(malformed.folder, "plan.json"), "bad"); applyHistoricalProvenance(malformed.root, malformed.run); expect(malformed.run.cohort).toBeNull();
  const other = setup(); other.run.cohort = "other"; applyHistoricalProvenance(other.root, other.run); expect(other.run.cohort).toBe("other");
  const artifact = setup(); writeFileSync(join(artifact.folder, "serving-model.json"), JSON.stringify({ id: "different", metadata: { upstream_model_id: "wrong" } })); applyHistoricalProvenance(artifact.root, artifact.run); expect(artifact.run.measurement?.artifact).toBeUndefined();
});
