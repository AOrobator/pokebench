// Strict per-feature history for the next-run switchboard: for each switch,
// the past runs identical to the draft except for that one switch (same
// model, thinking, budgets, target, boot start and every other feature).
import { SWITCHABLE_FEATURES, type SwitchableFeature } from "@pokebench/agent/features";
import {configOf,type RunConfig} from "./run-config.js";
export {configOf,type RunConfig} from "./run-config.js";
import { BaselineError, RunsError, baselineOf, listRuns, readStart, type BaselineReader } from "./runs.js";
import { readExclusions } from "./run-exclusions.js";
import { customLaneOfStart } from "./custom-lane.js";



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


// A custom lane's helped runs never count toward a switch's on/off arms.
export const poolableConfig = (start: Parameters<typeof configOf>[0]): RunConfig | null => customLaneOfStart(start) === null ? configOf(start) : null;

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
      const config = poolableConfig(readStart(runsRoot, summary.id));
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
