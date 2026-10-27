// Strict per-feature history for the next-run switchboard: for each switch,
// the past runs identical to the draft except for that one switch (same
// model, thinking, budgets, target, boot start and every other feature).
import { MEASUREMENT_FEATURES, SWITCHABLE_FEATURES, featuresOf, playHarnessFeatures, type FeatureSet, type SwitchableFeature } from "@pokebench/agent/features";
import type { RunEvent } from "@pokebench/agent/events";
import { BaselineError, RunsError, baselineOf, listRuns, readStart, type BaselineReader } from "./runs.js";
import { readExclusions } from "./run-exclusions.js";

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

export interface ArmOutcome {
  readonly runs: number;
  readonly reached: Readonly<Record<string, number>>;
  readonly medianMs: Readonly<Record<string, number>>;
  // Milestones reached by each run the operator aborted or stopped; later milestones are censored.
  readonly stopped?: readonly (readonly string[])[];
}

export interface FeatureHistory {
  readonly on: ArmOutcome;
  readonly off: ArmOutcome;
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

function sameExcept(a: RunConfig, b: RunConfig, feature: SwitchableFeature): boolean {
  return a.model === b.model && a.thinking === b.thinking && a.maxTokens === b.maxTokens && a.maxTurns === b.maxTurns && a.maxWallMs === b.maxWallMs && a.failureLimit === b.failureLimit && a.target === b.target &&
    SWITCHABLE_FEATURES.every((id) => id === feature || a.features[id] === b.features[id]);
}

function median(values: number[]): number {
  const sorted = values.slice().sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? (sorted[mid] ?? 0) : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function arm(runs: readonly Scored[]): ArmOutcome {
  const splits = new Map<string, number[]>();
  for (const run of runs) for (const m of run.milestones) splits.set(m.name, [...(splits.get(m.name) ?? []), m.offsetMs]);
  const stopped = runs.filter((run) => run.operatorEnded).map((run) => run.milestones.map((m) => m.name));
  return {
    runs: runs.length,
    reached: Object.fromEntries([...splits].map(([name, values]) => [name, values.length])),
    medianMs: Object.fromEntries([...splits].map(([name, values]) => [name, median(values)])),
    ...(stopped.length === 0 ? {} : { stopped }),
  };
}

interface Scored { readonly config: RunConfig; readonly milestones: { name: string; offsetMs: number }[]; readonly operatorEnded: boolean }

// Ended, validated runs, requested at once. An operator abort or stop keeps its earned progress;
// only the operator's explicit exclusion removes a run.
async function scoredRuns(runsRoot: string, readBaseline: BaselineReader): Promise<Scored[]> {
  const { exclusions } = readExclusions(runsRoot);
  const scored = await Promise.all(listRuns(runsRoot).map(async (summary): Promise<Scored | null> => {
    if (!summary.ended || summary.problem !== null || exclusions.has(summary.id)) return null;
    try {
      const config = configOf(readStart(runsRoot, summary.id));
      if (config === null) return null;
      // Baseline offsets already exclude operator pauses. Match and score at the
      // recorded original horizon; replay/baseline retain continuation progress.
      return { config, operatorEnded: summary.reason === "operator_abort" || summary.reason === "operator_stop", milestones: (await readBaseline(summary.id)).milestones.filter((m) => m.derived !== true && (config.maxWallMs === null || m.offsetMs <= config.maxWallMs)) };
    } catch (error) {
      if (!(error instanceof BaselineError || error instanceof RunsError)) throw error;
      return null;
    }
  }));
  return scored.filter((run): run is Scored => run !== null);
}

export async function featureHistory(runsRoot: string, draft: RunConfig, readBaseline: BaselineReader = (id) => Promise.resolve().then(() => baselineOf(runsRoot, id))): Promise<Record<SwitchableFeature, FeatureHistory | null>> {
  const scored = await scoredRuns(runsRoot, readBaseline);
  return Object.fromEntries(SWITCHABLE_FEATURES.map((feature) => {
    const matching = scored.filter((run) => sameExcept(run.config, draft, feature));
    const on = matching.filter((run) => run.config.features[feature]);
    const offRuns = matching.filter((run) => !run.config.features[feature]);
    return [feature, on.length === 0 || offRuns.length === 0 ? null : { on: arm(on), off: arm(offRuns) }];
  })) as Record<SwitchableFeature, FeatureHistory | null>;
}
