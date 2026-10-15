// Read side of the winner gate: nominations, finals ledgers and decisions under
// runs/experiments/<id>/, the promotions ledger, and finished external cohorts under
// runs/launch-receipts/ (read only: nothing here writes there).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { decideFinals, finalsConfig, finalsPlan, finalsPreset, nominate, parseFinalsLedger, parseNomination, parsePromotions, rankArms, withPromotion, type ArmRank, type ArmRuns, type FinalsConfig, type FinalsDecision, type FinalsEntry, type Nomination, type Promotion, type RunOutcome } from "@pokebench/agent/experiment-gate";
import { experimentArms, trialOrder, type Experiment, type LedgerEntry, type ReadinessRun, type RunnerPosition, type TrialState } from "@pokebench/agent/experiments";
import { SWITCHABLE_FEATURES, type SwitchableFeature } from "@pokebench/agent/features";
import { parsePlayPreset, type PlayPresetV2 } from "@pokebench/agent/play-preset";
import type { RunSource } from "./experiment-store.js";

const dir = (runsRoot: string, id: string): string => join(runsRoot, "experiments", id);
export const nominationPath = (runsRoot: string, id: string): string => join(dir(runsRoot, id), "nomination.json");
export const finalsLedgerPath = (runsRoot: string, id: string): string => join(dir(runsRoot, id), "finals.jsonl");
export const finalsResultPath = (runsRoot: string, id: string): string => join(dir(runsRoot, id), "finals-result.json");
export const finalsWithdrawnPath = (runsRoot: string, id: string): string => join(dir(runsRoot, id), "finals-withdrawn.json");
export const promotionsPath = (runsRoot: string): string => join(runsRoot, "experiments", "promotions.jsonl");
// The runner position while finals run: runner.json names `<id>:finals`.
export const finalsRunner = (id: string): string => `${id}:finals`;

export function readPromotions(runsRoot: string, problems: string[] = []): Promotion[] {
  const path = promotionsPath(runsRoot);
  if (!existsSync(path)) return [];
  const { promotions, problems: bad } = parsePromotions(readFileSync(path, "utf8"));
  problems.push(...bad.map((p) => `promotions.jsonl ${p}`));
  return promotions;
}
// Every promotion up to `upTo` (all when undefined), folded into one overlay; null when there are none.
export function promotionOverlay(promotions: readonly Promotion[], upTo?: string | null): Promotion | null {
  if (upTo === null) return null;
  const end = upTo === undefined ? promotions.length : promotions.findIndex((p) => p.id === upTo) + 1;
  const used = promotions.slice(0, end), last = used.at(-1);
  if (last === undefined) return null;
  return { ...last, features: Object.assign({}, ...used.map((p) => p.features)) as Record<string, boolean> };
}
// The promotion a started experiment runs under is the one its first trial recorded (none for
// trials launched before the gate existed); an unstarted one takes the latest.
export function pinnedPromotion(ledger: readonly LedgerEntry[]): string | null | undefined {
  const first = ledger.find((e): e is Extract<LedgerEntry, { type: "launch" }> => e.type === "launch");
  return first === undefined ? undefined : (first.promotion ?? null);
}
export function effectiveExperiment(experiment: Experiment, ledger: readonly LedgerEntry[], promotions: readonly Promotion[]): { experiment: Experiment; superseded: string | null; promotion: string | null } {
  const overlay = promotionOverlay(promotions, pinnedPromotion(ledger));
  return { ...withPromotion(experiment, overlay), promotion: overlay?.id ?? null };
}

export interface CohortRecord { readonly id: string; readonly dir: string; readonly done: boolean; readonly status: string; readonly arms: readonly string[]; readonly presets: ReadonlyMap<string, PlayPresetV2>; readonly outcomes: readonly { readonly arm: string; readonly run: string }[] }
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
// A hand-run cohort under runs/launch-receipts/<name>/ whose manifest.json id matches.
export function findCohort(runsRoot: string, cohort: string): CohortRecord | null {
  const root = join(runsRoot, "launch-receipts");
  if (!existsSync(root)) return null;
  for (const name of readdirSync(root).sort()) {
    const here = join(root, name);
    let manifest: unknown;
    try {
      manifest = readJson(join(here, "manifest.json"));
    } catch {
      continue;
    }
    if (!isRecord(manifest) || manifest["id"] !== cohort || !isRecord(manifest["presets"])) continue;
    const arms = Object.keys(manifest["presets"]);
    const presets = new Map(arms.map((arm) => [arm, parsePlayPreset(readJson(join(here, `preset-${arm}.json`))) as PlayPresetV2]));
    let status = "missing";
    try {
      const q = readJson(join(here, "queue.json"));
      if (isRecord(q) && typeof q["status"] === "string") status = q["status"];
    } catch {
      // no queue.json yet
    }
    const outcomes: { arm: string; run: string }[] = [];
    if (existsSync(join(here, "trials.jsonl"))) {
      for (const line of readFileSync(join(here, "trials.jsonl"), "utf8").split("\n")) {
        if (line.trim() === "") continue;
        try {
          const row: unknown = JSON.parse(line);
          if (isRecord(row) && row["type"] === "outcome" && typeof row["arm"] === "string" && typeof row["run"] === "string" && arms.includes(row["arm"])) outcomes.push({ arm: row["arm"], run: row["run"] });
        } catch {
          // a torn last line while the driver writes
        }
      }
    }
    return { id: cohort, dir: here, done: status === "done", status, arms, presets, outcomes };
  }
  return null;
}

const outcomesOf = (source: RunSource, runs: readonly string[]): RunOutcome[] => runs.flatMap((run) => { const m = source.trial(run); return m === null ? [] : [{ reached: m.reached, milestoneMs: m.milestoneMs }]; });
const diff = (from: PlayPresetV2, to: PlayPresetV2): Partial<Record<SwitchableFeature, boolean>> =>
  Object.fromEntries(SWITCHABLE_FEATURES.filter((id) => from.features[id] !== to.features[id]).map((id) => [id, to.features[id]]));
// Recorded boot runs of the same model lane that match the finals incumbent's switches and limits, latest first.
export function reusableRuns(preset: PlayPresetV2, lane: string, runs: readonly ReadinessRun[], limit: number): string[] {
  return runs.filter((r) => r.model === lane && r.start === "boot" && r.maxTurns === preset.limits.maxTurns && r.maxWallMs === preset.limits.maxWallMs && SWITCHABLE_FEATURES.every((id) => r.features[id] === preset.features[id]))
    .slice(-limit).reverse().map((r) => r.id);
}
function nomination(experiment: Experiment, source: RunSource, from: "queue" | "cohort", base: PlayPresetV2, ranking: ArmRank[], finalists: { arm: string; switches: Partial<Record<SwitchableFeature, boolean>> }[], now: Date, cohort?: string): Nomination {
  const finals = finalsConfig(experiment);
  for (const f of finalists) finalsPreset(base, experiment.id, f.arm, f.switches, finals);
  const incumbent = finalsPreset(base, experiment.id, "incumbent", {}, finals);
  const reason = finalists.length === 0 ? "no arm ranked above the incumbent; the incumbent stays" : `${finalists.map((f) => f.arm).join(", ")} ranked above the incumbent`;
  const reusedIncumbent = finalists.length === 0 ? [] : reusableRuns(incumbent, experiment.modelLane, source.recent(), finals.runsPerArm);
  return { experiment: experiment.id, source: from, ...(cohort === undefined ? {} : { cohort }), at: now.toISOString(), incumbent, finals, ranking, reusedIncumbent, finalists, reason };
}
// The cohort's arm named "control" is its incumbent; each finalist is the switches it differs in.
export function cohortNomination(experiment: Experiment, cohort: CohortRecord, source: RunSource, now: Date): Nomination {
  const control = cohort.presets.get("control");
  if (control === undefined) throw new Error(`${cohort.id}: the cohort has no control arm`);
  const arms: ArmRuns[] = cohort.arms.map((arm) => ({ arm, runs: outcomesOf(source, cohort.outcomes.filter((o) => o.arm === arm).map((o) => o.run)) }));
  const ranking = rankArms(arms, experiment.primaryMilestone, "control");
  const finalists = nominate(ranking, "control").map((arm) => ({ arm, switches: diff(control, cohort.presets.get(arm) ?? control) }));
  return nomination(experiment, source, "cohort", control, ranking, finalists, now, cohort.id);
}
// A two-arm queue experiment nominates its candidate only when it ranks above the incumbent.
export function queueNomination(experiment: Experiment, ledger: readonly LedgerEntry[], source: RunSource, now: Date): Nomination {
  const order = trialOrder(experiment), latest = new Map<number, string>();
  for (const e of ledger) if (e.type === "outcome" && e.trial < order.length && e.arm === order[e.trial]) latest.set(e.trial, e.run);
  const runsOf = (arm: string): string[] => [...latest.entries()].filter(([trial]) => order[trial] === arm).map(([, run]) => run);
  const ranking = rankArms([{ arm: "incumbent", runs: outcomesOf(source, runsOf("incumbent")) }, { arm: "candidate", runs: outcomesOf(source, runsOf("candidate")) }], experiment.primaryMilestone, "incumbent");
  const arms = experimentArms(experiment);
  const finalists = nominate(ranking, "incumbent").map((arm) => ({ arm, switches: diff(arms.incumbent, arms.candidate) }));
  return nomination(experiment, source, "queue", arms.incumbent, ranking, finalists, now);
}

export interface FinalsTrial { readonly index: number; readonly arm: string; readonly state: TrialState; readonly run: string | null }
export type GateState = "waiting" | "nominating" | "finals" | "held" | "withdrawn" | "declared" | "inconclusive" | "no-finalists";
export interface FinalsResult { readonly experiment: string; readonly decidedAt: string; readonly decision: FinalsDecision; readonly promotion: string | null }
export interface GateView {
  readonly experiment: string;
  readonly title: string;
  readonly state: GateState;
  readonly reason: string;
  readonly source: "queue" | "cohort" | null;
  readonly finals: FinalsConfig;
  readonly finalists: readonly { readonly arm: string; readonly switches: Readonly<Record<string, boolean>> }[];
  readonly ranking: readonly ArmRank[];
  readonly trials: readonly FinalsTrial[];
  readonly decision: FinalsDecision | null;
  readonly winner: string | null;
}

export function readNomination(runsRoot: string, id: string, problems: string[]): Nomination | null {
  const path = nominationPath(runsRoot, id);
  if (!existsSync(path)) return null;
  try {
    return parseNomination(readJson(path));
  } catch (error) {
    problems.push(`${id}: nomination.json: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
export function finalsLedger(runsRoot: string, id: string, problems: string[] = []): FinalsEntry[] {
  const path = finalsLedgerPath(runsRoot, id);
  if (!existsSync(path)) return [];
  const { entries, problems: bad } = parseFinalsLedger(readFileSync(path, "utf8"));
  problems.push(...bad.map((p) => `${id}: finals.jsonl ${p}`));
  return entries;
}
function finalsResult(runsRoot: string, id: string): FinalsResult | null {
  try {
    const value = readJson(finalsResultPath(runsRoot, id));
    return isRecord(value) && value["experiment"] === id && isRecord(value["decision"]) ? (value as unknown as FinalsResult) : null;
  } catch {
    return null;
  }
}
export const finalsArms = (n: Nomination): string[] => ["incumbent", ...n.finalists.map((f) => f.arm)];
export function finalsTrials(n: Nomination, ledger: readonly FinalsEntry[], runner: RunnerPosition | null): FinalsTrial[] {
  return finalsPlan(finalsArms(n), n.finals.runsPerArm, n.reusedIncumbent.length).map((arm, index) => {
    const mine = ledger.filter((e) => e.trial === index), run = mine.filter((e) => e.type === "launch").at(-1)?.run ?? null;
    if (run === null) return { index, arm, state: "waiting", run };
    const ended = mine.find((e) => e.run === run && e.type !== "launch");
    const state: TrialState = ended?.type === "outcome" ? "done" : ended?.type === "launcher_error" ? "failed" : runner?.experiment === finalsRunner(n.experiment) && runner.trial === index ? "running" : "interrupted";
    return { index, arm, state, run };
  });
}
// The decision over the latest outcome of every finals trial, once all of them finished.
export function decide(n: Nomination, ledger: readonly FinalsEntry[], source: RunSource): FinalsDecision | null {
  const trials = finalsTrials(n, ledger, null);
  if (trials.some((t) => t.state !== "done")) return null;
  // Every finals run counts (PB2): one whose log can no longer be read scores as reaching nothing.
  const runsOf = (arm: string): RunOutcome[] => [...(arm === "incumbent" ? n.reusedIncumbent : []), ...trials.filter((t) => t.arm === arm).map((t) => t.run ?? "")].map((run) => { const m = source.trial(run); return m === null ? { reached: [], milestoneMs: {} } : { reached: m.reached, milestoneMs: m.milestoneMs }; });
  return decideFinals({ incumbent: runsOf("incumbent"), finalists: n.finalists.map((f) => ({ arm: f.arm, runs: runsOf(f.arm) })) });
}

// cohort: for an experiment measured in an external cohort, whether that cohort finished and, if not, why it is waited for.
export function gateView(experiment: Experiment, runsRoot: string, runner: RunnerPosition | null, problems: string[], cohort: { readonly done: boolean; readonly waiting: string } | null): GateView | null {
  // A discarded experiment is closed: it never nominates, runs finals or holds the queue.
  if (experiment.discarded !== undefined) return null;
  const n = readNomination(runsRoot, experiment.id, problems);
  const base = { experiment: experiment.id, title: experiment.title, finals: n?.finals ?? finalsConfig(experiment), decision: null, winner: null };
  if (n === null) {
    if (cohort === null) return null;
    const empty = { ...base, source: "cohort" as const, finalists: [], ranking: [], trials: [] };
    return cohort.done ? { ...empty, state: "nominating", reason: `the ${experiment.externalCohort ?? ""} cohort finished; its finalists are nominated next` } : { ...empty, state: "waiting", reason: cohort.waiting };
  }
  const common = { ...base, source: n.source, finalists: n.finalists, ranking: n.ranking };
  if (n.finalists.length === 0) return { ...common, state: "no-finalists", reason: n.reason, trials: [] };
  const trials = finalsTrials(n, finalsLedger(runsRoot, experiment.id, problems), runner);
  const result = finalsResult(runsRoot, experiment.id);
  if (result !== null) {
    const winner = result.decision.winner;
    return { ...common, trials, decision: result.decision, winner, state: winner === null ? "inconclusive" : "declared", reason: winner === null ? "no finalist beat the incumbent from boot; the incumbent stays" : `${winner} won the finals and is now the incumbent` };
  }
  const done = trials.filter((t) => t.state === "done").length, total = String(trials.length);
  if (existsSync(finalsWithdrawnPath(runsRoot, experiment.id))) return { ...common, trials, state: "withdrawn", reason: `finals withdrawn after ${String(done)} of ${total} runs; resume them, or discard the experiment to unblock the queue` };
  const running = runner?.experiment === finalsRunner(experiment.id) ? runner : null;
  return { ...common, trials, state: running !== null || done === 0 ? "finals" : "held", reason: running !== null ? `finals run ${String(running.trial + 1)} of ${total} running` : done === 0 ? `${String(n.finalists.length)} finalist(s) wait for ${total} runs from boot` : `finals stopped after ${String(done)} of ${total} runs; the queue resumes them` };
}

// Unsettled gate entries hold back every new experiment.
export const UNSETTLED: readonly GateState[] = ["waiting", "nominating", "finals", "held", "withdrawn"];
