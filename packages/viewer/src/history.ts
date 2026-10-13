// Strict per-feature history for the next-run switchboard: for each switch,
// the past runs identical to the draft except for that one switch (same
// model, thinking, budgets, target, boot start and every other feature).
import { SWITCHABLE_FEATURES, featuresOf, playHarnessFeatures, type FeatureSet, type SwitchableFeature } from "@pokebench/agent/features";
import type { RunEvent } from "@pokebench/agent/events";
import { BaselineError, RunsError, baselineOf, listRuns, readStart } from "./runs.js";

export interface RunConfig {
  readonly model: string;
  readonly thinking: string;
  readonly maxTokens: number;
  readonly maxTurns: number | null;
  readonly maxWallMs: number | null;
  readonly target: string | null;
  readonly features: FeatureSet;
}

export interface ArmOutcome {
  readonly runs: number;
  readonly reached: Readonly<Record<string, number>>;
  readonly medianMs: Readonly<Record<string, number>>;
}

export interface FeatureHistory {
  readonly on: ArmOutcome;
  readonly off: ArmOutcome;
}

type Start = Extract<RunEvent, { type: "run_start" }>;

// A run whose recorded features are not exactly a registry play set (probes,
// smoke runs, older harness revisions) has no comparable configuration.
export function configOf(start: Start): RunConfig | null {
  if (start.start_state.kind !== "boot") return null;
  const features = featuresOf(start.harness_features);
  const target = start.evaluation?.target ?? null;
  if (JSON.stringify(playHarnessFeatures(features, target)) !== JSON.stringify(start.harness_features)) return null;
  return { model: start.model.id, thinking: start.sampling.thinking_level, maxTokens: start.sampling.max_tokens, maxTurns: start.budgets.max_turns ?? null, maxWallMs: start.budgets.max_wall_ms ?? null, target, features };
}

function sameExcept(a: RunConfig, b: RunConfig, feature: SwitchableFeature): boolean {
  return a.model === b.model && a.thinking === b.thinking && a.maxTokens === b.maxTokens && a.maxTurns === b.maxTurns && a.maxWallMs === b.maxWallMs && a.target === b.target &&
    SWITCHABLE_FEATURES.every((id) => id === feature || a.features[id] === b.features[id]);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function arm(runs: readonly { name: string; offsetMs: number }[][]): ArmOutcome {
  const splits = new Map<string, number[]>();
  for (const milestones of runs) for (const m of milestones) splits.set(m.name, [...(splits.get(m.name) ?? []), m.offsetMs]);
  return {
    runs: runs.length,
    reached: Object.fromEntries([...splits].map(([name, values]) => [name, values.length])),
    medianMs: Object.fromEntries([...splits].map(([name, values]) => [name, median(values)])),
  };
}

interface Scored { readonly config: RunConfig; readonly milestones: { name: string; offsetMs: number }[] }

// Ended, validated, non-aborted runs (operator_stop still counts).
function scoredRuns(runsRoot: string): Scored[] {
  const scored: Scored[] = [];
  for (const summary of listRuns(runsRoot)) {
    if (!summary.ended || summary.problem !== null || summary.reason === "operator_abort") continue;
    try {
      const config = configOf(readStart(runsRoot, summary.id));
      if (config === null) continue;
      scored.push({ config, milestones: baselineOf(runsRoot, summary.id).milestones.filter((m) => m.derived !== true) });
    } catch (error) {
      if (!(error instanceof BaselineError || error instanceof RunsError)) throw error;
    }
  }
  return scored;
}

export function featureHistory(runsRoot: string, draft: RunConfig): Record<SwitchableFeature, FeatureHistory | null> {
  const scored = scoredRuns(runsRoot);
  return Object.fromEntries(SWITCHABLE_FEATURES.map((feature) => {
    const matching = scored.filter((run) => sameExcept(run.config, draft, feature));
    const on = matching.filter((run) => run.config.features[feature]).map((run) => run.milestones);
    const offRuns = matching.filter((run) => !run.config.features[feature]).map((run) => run.milestones);
    return [feature, on.length === 0 || offRuns.length === 0 ? null : { on: arm(on), off: arm(offRuns) }];
  })) as Record<SwitchableFeature, FeatureHistory | null>;
}
