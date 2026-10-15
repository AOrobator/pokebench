export interface NavigationTrial { ordinal: number; arm: "off" | "on"; run: string | null; phase: "planned" | "launched" | "process_ended" | "completed"; failed: boolean }
export interface NavigationReceipt { id: string; source: string; model: string; trials: NavigationTrial[]; failure: string | null }
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const digestOf = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(x => typeof x === "string");
export function parseNavigationReceipt(manifest: unknown, rows: readonly unknown[], digest: string, repoRoot: string): NavigationReceipt {
  if (!record(manifest) || manifest.version !== 1 || manifest.id !== "navigation-memory-think-fast-n4" || manifest.root !== repoRoot || typeof manifest.source !== "string" || !/^[a-f0-9]{40}$/.test(manifest.source) || !record(manifest.model) || typeof manifest.model.id !== "string" || !Array.isArray(manifest.order) || manifest.order.length !== 8 || !manifest.order.every(a => a === "off" || a === "on") || manifest.order.filter(a => a === "off").length !== 4 || !record(manifest.presets) || !record(manifest.expected_harness_features) || !digestOf(digest)) throw new Error("Unsupported eight-trial navigation manifest");
  for (const arm of ["off", "on"] as const) {
    const preset: unknown = manifest.presets[arm], features: unknown = manifest.expected_harness_features[arm];
    if (!record(preset) || preset.version !== 2 || typeof preset.id !== "string" || !record(preset.features) || preset.features["navigation-evidence-memory-v1"] !== (arm === "on") || !strings(features) || features.includes("navigation-evidence-memory-v1") !== (arm === "on")) throw new Error("Navigation arm configuration is invalid");
  }
  const trials: NavigationTrial[] = manifest.order.map((arm, index) => ({ ordinal: index + 1, arm: arm as "off" | "on", run: null, phase: "planned", failed: false }));
  let current = 0, stopped = false, previous = -Infinity, failure: string | null = null;
  const runs = new Set<string>();
  for (const raw of rows) {
    if (!record(raw) || raw.manifest_sha256 !== digest || typeof raw.at !== "string" || !Number.isFinite(Date.parse(raw.at)) || Date.parse(raw.at) < previous || stopped) throw new Error("Navigation ledger identity, timestamp or stop boundary is invalid");
    previous = Date.parse(raw.at);
    if (raw.type === "launcher_error") {
      if (typeof raw.error !== "string") throw new Error("Navigation launcher failure has no reason");
      failure = raw.error; stopped = true; continue;
    }
    const trial = trials[current];
    if (trial === undefined || raw.trial !== trial.ordinal || raw.arm !== trial.arm || typeof raw.run !== "string" || !/^[a-zA-Z0-9_-]+$/.test(raw.run)) throw new Error("Navigation trial identity or serial order is invalid");
    if (raw.type === "launch") {
      if (trial.phase !== "planned" || runs.has(raw.run) || !count(raw.pid) || raw.pid === 0 || typeof raw.viewer !== "string") throw new Error("Navigation launch is invalid");
      trial.run = raw.run; trial.phase = "launched"; runs.add(raw.run);
    } else if (raw.type === "process_outcome") {
      if (trial.phase !== "launched" || trial.run !== raw.run || !(raw.code === null || (typeof raw.code === "number" && Number.isSafeInteger(raw.code))) || !(raw.signal === null || typeof raw.signal === "string")) throw new Error("Navigation process outcome is invalid");
      trial.phase = "process_ended"; trial.failed = raw.code !== 0 || raw.signal !== null;
    } else if (raw.type === "outcome") {
      if (trial.phase !== "process_ended" || trial.failed || trial.run !== raw.run || typeof raw.reason !== "string" || !["budget", "stuck", "model_error"].includes(raw.reason) || !digestOf(raw.events_sha256) || !digestOf(raw.system_prompt_sha256) || !count(raw.turns) || !count(raw.memory_context_count) || !count(raw.destination_writes) || (trial.arm === "on" ? raw.memory_context_count === 0 : raw.memory_context_count !== 0) || !Array.isArray(raw.milestones) || !Array.isArray(raw.warnings)) throw new Error("Navigation verified outcome is invalid");
      trial.phase = "completed"; current++;
    } else throw new Error("Unknown navigation ledger row");
  }
  return { id: manifest.id, source: manifest.source, model: manifest.model.id, trials, failure };
}
