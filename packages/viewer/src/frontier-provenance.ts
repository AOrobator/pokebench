import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RecordingMeasurement } from "./frontier-recording.js";
interface ProvenanceRun {
  id: string; cohort: string | null; model: string | null; measurement?: RecordingMeasurement;
  config: { source: string; preset: string | null; maxTurns: number | null; maxWallMs: number | null; failureLimit: number | null; thinking: string; maxTokens: number; features: { id: string; on: boolean | null }[] } | null;
}
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function bytes(path: string): string {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.size > 1024 * 1024) throw new Error("Launch receipt is not a bounded regular file");
  return readFileSync(path, "utf8");
}
function json(text: string): Record<string, unknown> { const value: unknown = JSON.parse(text); if (!record(value)) throw new Error("Invalid launch receipt"); return value; }
const hash = (text: string): string => createHash("sha256").update(text).digest("hex");
export function applyHistoricalProvenance(root: string, run: ProvenanceRun): void {
  const config = run.config, measurement = run.measurement;
  if (config === null || measurement === undefined) return;
  const base = join(root, "launch-receipts"); if (!existsSync(base)) return;
  for (const directory of readdirSync(base, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue;
    const prefix = `launch-receipts/${directory.name}`, folder = join(base, directory.name), planPath = join(folder, "plan.json"), ledgerPath = join(folder, "trials.jsonl");
    if (!existsSync(planPath) || !existsSync(ledgerPath)) continue;
    try {
      const planBytes = bytes(planPath), ledgerBytes = bytes(ledgerPath), plan = json(planBytes);
      if (plan.source !== config.source || !Array.isArray(plan.order) || !record(plan.presets)) continue;
      const launches = ledgerBytes.split("\n").filter(line => line.trim() !== "").map(line => json(line)).filter(row => row.type === "launch" && row.run === run.id);
      if (launches.length !== 1) continue;
      const launch = launches[0]; if (launch === undefined || !Number.isSafeInteger(launch.trial) || typeof launch.trial !== "number" || launch.trial < 1 || plan.order[launch.trial - 1] !== launch.arm || typeof launch.arm !== "string") continue;
      const preset: unknown = plan.presets[launch.arm];
      if (!record(preset) || preset.id !== config.preset || !record(preset.features) || !record(preset.limits) || !record(preset.sampling) || preset.limits.maxTurns !== config.maxTurns || preset.limits.maxWallMs !== config.maxWallMs || preset.limits.failureLimit !== config.failureLimit || preset.sampling.thinkingLevel !== config.thinking || preset.sampling.maxTokens !== config.maxTokens) continue;
      const features = preset.features;
      if (!Object.entries(features).every(([id, on]) => typeof on === "boolean" && measurement.features.includes(id) === on)) continue;
      if (run.cohort !== null && run.cohort !== directory.name) continue;
      const receipts = [{ path: `${prefix}/plan.json`, sha256: hash(planBytes) }, { path: `${prefix}/trials.jsonl`, sha256: hash(ledgerBytes) }];
      let artifact: RecordingMeasurement["artifact"];
      const servingPath = join(folder, "serving-model.json");
      if (existsSync(servingPath)) {
        const servingBytes = bytes(servingPath), serving = json(servingBytes);
        if (serving.id === run.model && record(serving.metadata) && typeof serving.metadata.upstream_model_id === "string" && serving.metadata.upstream_model_id.length <= 1000) artifact = { id: serving.metadata.upstream_model_id, receipt: `${prefix}/serving-model.json`, sha256: hash(servingBytes) };
      }
      for (const feature of config.features) if (Object.hasOwn(features, feature.id)) feature.on = features[feature.id] as boolean;
      run.cohort = directory.name; measurement.receipts = receipts; if (artifact !== undefined) measurement.artifact = artifact;
      return;
    } catch { /* Malformed/unbound receipts cannot supply flags or model identity. */ }
  }
}
