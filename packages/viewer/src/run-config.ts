// Pure recorded-header interpretation shared by history and current projection.
import {FEATURES,MEASUREMENT_FEATURES,featuresOf,playHarnessFeatures,type FeatureSet} from "@pokebench/agent/features";
import {REQUIRED_FRONTIER_MILESTONES} from "@pokebench/agent/milestones";
import type {RunEvent} from "@pokebench/agent/events";
import type {WorkbenchConfig} from "./workbench-data.js";
export interface RunConfig {
  readonly model: string;
  readonly thinking: string;
  readonly maxTokens: number;
  readonly maxTurns: number | null;
  readonly maxWallMs: number | null;
  // Runs without a preset used the play default of 3.
  readonly failureLimit: number;
  readonly target: string | null;
  readonly features: FeatureSet;
}
type Start = Extract<RunEvent, { type: "run_start" }>;

// A run whose recorded features are not exactly a registry play set (probes,
// smoke runs, older harness revisions) has no comparable configuration.
// The target stop changes how a run ends, so it is matched like a behavior feature.
const MEASURED: ReadonlySet<string> = new Set(MEASUREMENT_FEATURES.filter((id) => id !== "native-target-stop-v1"));
const behaviorOnly = (ids: readonly string[]): string[] => ids.filter((id) => !MEASURED.has(id));

export function configOf(start: Start): RunConfig | null {
  if (start.controller?.kind === "human") return null;
  if (start.start_state.kind !== "boot") return null;
  const features = featuresOf(start.harness_features);
  const target = start.evaluation?.target ?? null;
  // Measurement-only features record more without changing play, and new ones keep landing,
  // so they are left out of the match; every behavior feature must still agree exactly.
  if (JSON.stringify(behaviorOnly(playHarnessFeatures(features, target))) !== JSON.stringify(behaviorOnly(start.harness_features))) return null;
  return { model: start.model.id, thinking: start.sampling.thinking_level, maxTokens: start.sampling.max_tokens, maxTurns: start.budgets.max_turns ?? null, maxWallMs: start.budgets.max_wall_ms ?? null, failureLimit: start.evaluation?.failure_limit ?? 3, target, features };
}

export function resumeCheckpoint(start: Extract<RunEvent, { type: "run_start" }>): string | null {
  if (start.start_state.kind !== "save_state") return null;
  const file = start.start_state.path.split(/[/\\]/).pop() ?? "";
  return file === "MAIN_MENU.state" ? "MAIN_MENU" : REQUIRED_FRONTIER_MILESTONES.find(id => file === `${id}.state`) ?? null;
}
export function configuration(start: Extract<RunEvent, { type: "run_start" }>): WorkbenchConfig {
  const known = configOf(start);
  return {
    source: start.harness.commit, dirty: start.harness.dirty, vendor: start.vendor_pin, pi: start.pi_version,
    preset: start.evaluation?.preset_id ?? null, target: start.evaluation?.target ?? null, thinking: start.sampling.thinking_level,
    maxTokens: start.sampling.max_tokens, maxTurns: start.budgets.max_turns ?? null, maxWallMs: start.budgets.max_wall_ms ?? null,
    failureLimit: start.evaluation?.failure_limit ?? null, context: start.model.context_window, vision: start.model.vision,
    start: start.start_state.kind, resume: resumeCheckpoint(start), tools: start.tools,
    features: FEATURES.filter(f => f.switchable).map(f => ({ id: f.id, label: f.title, on: known === null ? (start.harness_features.includes(f.id) ? true : null) : known.features[f.id as keyof typeof known.features] })),
  };
}
