// The next run: a draft edited in the switchboard, queued behind the live run
// (one local model), launched as an ordinary recorded play run with a v2
// preset under the shared gameplay lease. Operator controls for a live run are
// appended to its runs/<id>/control.jsonl, which the agent polls.
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { ALL_ON, dependencyProblems, stateOnlyProblems, type FeatureSet } from "@pokebench/agent/features";
import { normalizeFeatures, FeatureSetSchema, parsePlayPreset, type PlayPresetV2 } from "@pokebench/agent/play-preset";
import { controlLine, isExtension, type ControlAction } from "@pokebench/agent/run-control";
import { newRunId } from "@pokebench/agent/run";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";
import { spawnDetached } from "./detached.js";
import { LeaseHeldError, leaseDir, leaseHolder, leaseStale, nameLeaseRun, pidAlive, readLeaseOwner, takeLease } from "./lease.js";
import { listRuns, readStart, readFrom, runDir, type RunCatalog } from "./runs.js";

const positive = Type.Integer({ minimum: 1 });
export const NextRunSchema = Type.Object({
  model: Type.String({ maxLength: 200 }),
  thinking: Type.Enum(["off", "minimal", "low", "medium", "high", "xhigh"] as const),
  maxTurns: positive, maxWallMs: positive, failureLimit: positive, maxTokens: positive,
  target: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  features: FeatureSetSchema,
}, { additionalProperties: false });
export type NextRun = Omit<Static<typeof NextRunSchema>, "features"> & {features:FeatureSet};

export const DEFAULT_NEXT_RUN: NextRun = { model: "", thinking: "medium", maxTurns: 300, maxWallMs: 30 * 60_000, failureLimit: 3, maxTokens: 8192, target: null, features: { ...ALL_ON, "semantic-refusal-reasons-v1":false, "caught-nickname-prompt-v2":false, "safe-navigation-strides-v1":false, "battle-refusal-loop-v1":false, "scripted-place-guidance-v1":false, "trigger-script-loop-v1":false, "cache-aligned-window-v1":false, "jit-guide-reuse-v1":false, "save-state-task-truth-v1":false, "state-only-decisions-v1":false, "pushback-loop-detection-v1": false, "pushback-press-result-v1": false, "battle-observation-loop-v1": false, "explorer-guidance-v1": false, "in-game-naming-readout-v1": false, "no-nickname-guidance-v1": false, "battle-message-waiting-v1": false, "connection-edge-tiles-v1": false, "named-interactions-v1": false, "world-destinations-v1": false, "bounded-navigation-v1": false, "full-map-navigation-v1": false, "grass-cost-navigation-v1": false, "game-evidence-priority-v1": false, "dialogue-log-v1": false, "loop-guard-supervisor-v1": false, "instruction-ledger-v1": false, "next-milestone-hint-v1": false, "double-context-window-v1": false, "fresh-retry-v1": false, "named-warp-destinations-v1": false, "milestone-stall-stop-v1": false, "text-only-supervisor-v1": false, "character-presence-v1": false, "navigation-refusal-reasons-v1": false, "transition-press-result-v1": false, "stall-briefing-v1": false, "battle-details-v2": false, "dialogue-auto-advance-v1": false, "warp-arrival-settle-v1": false, "dialogue-context-kept-v1": false, "displayed-place-names-v1": false, "transition-loop-detection-v1": false, "blocked-batch-result-v1": false, "adjacent-tiles-v1": false,"battle-triage-guidance-v1":false, "readout-rules-in-prompt-v1": false, "script-line-presence-v1": false, "offscreen-objects-v1": false, "navigate-first-prompt-v1": false, "presence-penalty-v1": false, "levelup-box-v1": false, "disproved-beliefs-v1": false, "same-plan-breaker-v1": false, "navigation-truth-v1": false, "navigation-refusal-reasons-v2": false, "low-hp-trainer-warning-v2": false, "battle-text-auto-advance-v1": false, "transition-coherence-v1": false, "briefing-exits-v1": false, "untaken-exits-v1": false, "people-ledger-v1": false, "trainer-heal-guidance-v1": false, "low-hp-trainer-warning-v1": false, "briefing-battle-outcomes-v1": false, "blocked-exit-fact-v1": false, "battle-loss-recap-v1": false, "readout-truth-v1": false, "birch-speech-pages-v1": false, "blackout-readout-v1": false, "surf-gated-exits-v1": false, "story-destinations-v1": false, "exit-reachability-v1": false, "cross-map-goal-v1": false, "explorer-guidance-v2": false, "ineffective-loops-v1": false, "people-id-cards-v1": false, "open-goal-prompt-v1": false, "heal-before-trainers-v1": false, "harness-trust-v1": false, "cited-destination-v1": false, "harness-trust-v2": false, "battle-move-tool-v1": false, "tutorial-party-owner-v1": false, "mid-frame-readout-v1": false, "unset-dynamic-warp-v1": false, "status-names-v1": false, "surf-gated-exits-v2": false, "instruction-ledger-v2": false, "no-exit-here-v1": false, "bag-healing-items-v1": false, "battle-menu-loop-v1": false, "clock-view-loop-v1": false,"stale-story-goal-v1": false, "input-cuts-v1": false, "loop-guard-screen-v1": false, "reopened-dialogue-loop-v1": false, "just-in-time-prompt-v1": false,"just-in-time-prompt-v2":false,"faced-interaction-history-v1":false,"dialog-button-b-v1": false,"dialogue-a-line-v1": false } };
Object.assign(DEFAULT_NEXT_RUN.features, {"rq-milestone-guide-v1":false,"rq-battle-explainer-v1":false,"rq-slim-prompt-v1":false,"rq-checkpoint-recovery-v1":false,"route-summary-v1":false,"rq-mach-dash-v1":false,"rq-no-grind-note-v1":false,"rq-old-rival-line-v1":false,"shop-shelf-hidden-v1":false,"field-call-input-v1":false,"first-visit-cycle-credit-v1":false,"unnamed-place-story-line-v1":false,"story-line-campaign-flags-v1":false,"junk-filter-leader-lines-v1":false,"story-line-start-steps-v1":false,"no-open-story-goal-v1":false,"navigator-elevation-zero-pads-v1":false,"navigator-ledge-drops-v1":false,"navigator-surf-start-warps-v1":false,"story-line-done-on-event-v1":false,"native-instruction-tasks-v1":false, "moving-npc-frame-burst-v1":false,"model-error-recovery-v1":false,"warp-target-navigation-v1":false,"dark-area-flash-reminder-v1":false,"rusturf-entry-followup-v1":false,"authored-scene-labels-v1":false,"checkpoint-research-note-v1":false,"rom-identity-v1":false,"town-center-checkpoint-v1":false,"eight-badge-mission-v1":false,"discovered-gym-checklist-v1":false,"current-question-focus-v1":false,"move-learn-type-matchup-v1":false,"screenshot-button-baseline-v1":false,"story-checkpoints-whole-game-v1":false,"destination-first-navigation-v1":false,"pokenav-call-auto-advance-v1":false,"neutral-yes-no-readout-v1":false,"instruction-memory-cap-v1":false,"id-card-bound-v1":false,"instruction-memory-junk-filter-v1":false,"refusal-ledger-bound-v1":false,"disproved-beliefs-bound-v1":false,"supervisor-briefing-bound-v1":false,"provider-wait-pause-v1":true,"badge-resets-cycles-v1":false,"drought-turns-only-v1":false,"compact-map-grid-v1":false,"scene-journal-safe-capture-v1":false,"self-named-speaker-v1":false,"story-briefing-native-milestones-v1":false,"retire-reached-story-line-v1":false,"gateway-current-turn-v1":false,"gateway-tool-schemas-v1":false,"gateway-schema-hint-v1":false,"type-gap-team-last-message-v1":false,"map-observability-v1":true,"type-gap-team-v1":false,"supplies-v1":false,"untalked-in-gym-v1":false,"context-exact-count-v1":false,"no-story-foreknowledge-v1":false,"instruction-memory-dedup-v1": false,"grass-strides-v1":false,"scene-followup-prompt-v1":false,"pokenav-short-list-v1":false,"menu-option-honest-refusal-v1":false,"instruction-goal-advisory-v1":false,"goal-review-repair-feedback-v1":false,"cutscene-journal-v1":false,"mauville-puzzle-readout-v1":true,"moving-npc-target-v1":false,"citation-evidence-v1":false,"bag-ineffective-loop-v1":false,"bag-press-feedback-v1":false,"bag-pocket-truth-v1":false,"menu-option-tool-v1":false,"instruction-goal-ledger-v1":false,"native-task-goal-retirement-v1":false,"player-elevation-readout-v1":false,"party-menu-message-v1":false,"drought-progress-facts-v1":false,"refusal-ledger-v1":false,"whiteout-outcomes-v2":false,"active-warp-exits-v1":false,"available-exits-presentation-v1":false,"interface-guidance-v1":false,"trainer-observed-party-v1":false,"navigation-cycle-stop-v1":false,"elevation-aware-map-v1":false,"screen-center-player-v1":false,"blackout-transition-v1":false,"restored-memory-run-v1":false,"move-learn-goal-reminder-v1":false,"move-learn-offer-identity-v1":false,"campaign-progress-clock-v1":false,"leader-loss-immediate-v1":false,"battle-action-history-v1":false,"leader-preparation-comparison-v1":false,"roxanne-campaign-reminder-v1":false,"coherent-battle-observation-v1":false,"map-cycle-recovery-v1":false,"random-starter-v1":false,"turn-drought-clock-v1":false,"static-npc-template-approach-v1":false,"owned-battle-context-v1":false,"reachable-section-alternatives-v1":false,"delivered-place-evidence-v1":false,"boundary-crossing-facts-v1":false,"npc-approach-feedback-v1":false,"leader-loss-comparison-v1":false,"rejected-movement-stride-v1":false,"battle-move-learn-input-v1":false,"navigation-recovery-v1":false,"milestone-drought-suppression-v1":false,"milestone-instruction-memory-v1":false,"gym-evidence-v1":false,"rejected-movement-step-v1":false,"observed-field-dialogue-v1":false,"birch-intro-pages-v1":false,"story-goal-player-name-v1":false,"cut-off-reply-feedback-v1":false,"trainer-sight-check-v2":false,"auto-talk-v2":false,"rejected-movement-prefix-v1":false,"away-note-buildings-v1":false,"current-map-display-name-v1":false,"window-escape-route-v1":false,"auto-talk-field-only-v1":false,"auto-talk-v3":false,"untalked-people-header-v1":false,"map-wide-triggers-v1":false,"drought-battle-heal-hold-v1":false,"tool-prompt-docs-v1":false,"field-ownership-feedback-v1":false,"move-learn-loop-fingerprint-v1":false,"stale-plan-fact-v1":false,"post-battle-readout-v1":false,"move-learn-tool-v1":false,"move-learn-early-comparison-v1":false,"poison-readout-v1":false,"berry-readout-v1":false,"shop-interface-v1":false,"progress-aware-cycles-v1":false,"exp-next-level-v1":false,"pokedex-own-v1":false,"exp-earned-ledger-v1":false,"leader-attempt-ledger-v1":false,"seen-trainers-ledger-v1":false,"party-coverage-v1":false,"said-type-matches-v1":false,"caught-dex-input-v1":false,"gym-door-label-v1":false,"mart-stock-readout-v1":false,"menu-refusal-recovery-v1":false,"move-learn-settle-v1":false,"move-learn-question-v1":false,"move-learn-comparison-v1":false,"effectiveness-heard-v1":false,"game-said-goals-v1":false,"menu-item-guidance-v1":false,"explorer-family-guidance-v1":false,"coherent-healing-feedback-v1":false,"factual-healing-guidance-v1":false,"story-battle-heal-first-v1":false,"pending-field-dialogue-v1":false,"exit-labels-v3":false,"navigation-tool-use-guard-v1":false,"semantic-current-map-feedback-v1":false,"short-cycle-fixed-point-v1":false,"navigation-refusal-reasons-v3":false,"yes-no-answer-readout-v1":false,"story-battle-heal-gate-v1":false,"party-item-confirmation-v1":false,"original-speed-pacing-v1":false,"semantic-navigation-v2":false,"evolution-decision-v1":false,"observed-instructions-v1":false,"starter-decision-salience-v1":false,"semantic-navigation-v1":false,"deterministic-exploration-v1":false,"ineffective-navigation-v2":false,"supervisor-briefing-v2":false,"reachable-story-guidance-v1":false,"text-only-supervisor-v2":false,"battle-decision-ready-v1":false, "visited-terrain-navigation-v1": false, "battle-effective-damage-v1": false, "deterministic-warp-navigation-v1": false, "stale-story-goal-v2": false, "context-token-budget-v1": false, "briefing-repeat-count-v1": false, "navigate-already-here-v1": false, "fixed-point-breaker-v1": false, "story-character-stall-gate-v1": false, "positive-supervisor-v1": false, "auto-talk-v1": false, "duplicate-turn-collapse-v1": false, "unfinished-activity-v1": false, "exit-labels-v2": false, "heal-before-trainers-v2": false, "gym-heal-warning-v1": false, "respawn-readout-v1": false, "trainer-sight-check-v1": false, "caught-nickname-prompt-v1": false, "fail-open-input-v1": false, "whiteout-healed-v1": false, "field-move-gates-v1": false, "gym-readiness-readout-v1": false, "same-target-no-progress-v1": false, "story-progress-clock-v1": false, "compact-map-base-glyph-v1": false, "drought-progress-credit-v2": false,
    "open-milestone-stall-v1": false,
    "stable-map-codes-v1": false, "solid-tile-leads-v1": false, "auto-talk-interrupt-note-v1": false, "deep-south-warp-label-v1": false, "recovery-note-field-only-v1": false, "moving-npc-intercept-v1": false, "warp-areas-v1": false, "bike-navigation-v1": false, "bike-register-v1": false, "bike-auto-mount-v1": false, "surf-navigation-v1": false, "rotating-gate-positions-v1": false, "rotating-gate-rules-v1": false, "rotating-gate-map-v1": false, "map-code-aliases-v1": false, "rotating-gate-navigation-v1": false, "rotating-gate-press-feedback-v1": false, "rotating-gate-regions-v1": false, "rotating-gate-turn-reasons-v1": false, "rotating-gate-push-log-v1": false });
// Whether a run's own game server answers on 127.0.0.1:<port>.
export type HealthProbe = (port: number) => Promise<boolean>;

export function healthProbe(fetchFn: typeof fetch = fetch): HealthProbe {
  return async (port) => {
    try {
      const response = await fetchFn(`http://127.0.0.1:${String(port)}/health`, { signal: AbortSignal.timeout(2_000) });
      return response.ok;
    } catch {
      return false;
    }
  };
}

export class NextRunError extends Error {
  override readonly name = "NextRunError";
}

const viewerDir = (runsRoot: string): string => join(runsRoot, ".viewer");

export function parseNextRun(value: unknown): NextRun {
  if (!Value.Check(NextRunSchema, value)) {
    const [first] = Value.Errors(NextRunSchema, value);
    throw new NextRunError(`invalid next run: ${first?.instancePath ?? ""} ${first?.message ?? "schema mismatch"}`);
  }
  const normalized={...value,features:normalizeFeatures(value.features)};
  const problems = [...dependencyProblems(normalized.features),...stateOnlyProblems(normalized.features)];
  if (problems.length > 0) throw new NextRunError(`invalid next run: ${problems.join("; ")}`);
  return normalized;
}

export function readDraft(runsRoot: string): NextRun {
  const path = join(viewerDir(runsRoot), "next-run.json");
  if (!existsSync(path)) return structuredClone(DEFAULT_NEXT_RUN);
  try {
    return parseNextRun(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return structuredClone(DEFAULT_NEXT_RUN);
  }
}

export function writeDraft(runsRoot: string, value: unknown): NextRun {
  const draft = parseNextRun(value);
  mkdirSync(viewerDir(runsRoot), { recursive: true });
  const path = join(viewerDir(runsRoot), "next-run.json");
  writeFileSync(`${path}.tmp`, `${JSON.stringify(draft, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
  return draft;
}

export function presetFor(draft: NextRun, runId: string): PlayPresetV2 {
  const preset = parsePlayPreset({ version: 2, id: `viewer-${runId}`.slice(0, 100), target: draft.target, limits: { maxTurns: draft.maxTurns, maxWallMs: draft.maxWallMs, failureLimit: draft.failureLimit }, sampling: { thinkingLevel: draft.thinking, maxTokens: draft.maxTokens }, features: draft.features });
  if (preset.version !== 2) throw new NextRunError("expected a v2 preset");
  return preset;
}

// A run is live while it has no run_end and its own game server is up: a long
// model call or an operator pause writes nothing, so log age says nothing.
// A killed run never writes run_end, and a later run can bind its port, so a
// port belongs only to the newest unended run that recorded it.
export async function liveRuns(runsRoot: string, healthy: HealthProbe, catalog: RunCatalog = () => listRuns(runsRoot)): Promise<string[]> {
  const owners = new Map<number, { id: string; at: number }>(), ports = new Map<string, number>();
  for (const run of catalog()) {
    if (run.ended || run.problem !== null) continue;
    let port: number;
    try { port = readStart(runsRoot, run.id).isolation.port; } catch { continue; }
    ports.set(run.id, port);
    const at = Date.parse(run.started ?? ""), owner = owners.get(port), when = Number.isNaN(at) ? -Infinity : at;
    if (owner === undefined || when > owner.at || (when === owner.at && run.id > owner.id)) owners.set(port, { id: run.id, at: when });
  }
  const candidates = [...ports].filter(([id, port]) => owners.get(port)?.id === id);
  const live = await Promise.all(candidates.map(async ([, port]) => {
    try {
      return await healthy(port);
    } catch {
      return false;
    }
  }));
  return candidates.filter((_, i) => live[i] === true).map(([id]) => id);
}

export async function appendControl(runsRoot: string, runId: string, action: ControlAction, now: Date, healthy: HealthProbe, catalog: RunCatalog = () => listRuns(runsRoot)): Promise<number> {
  if (!new RegExp(RUN_ID_PATTERN).test(runId) || !(await liveRuns(runsRoot, healthy, catalog)).includes(runId)) throw new NextRunError(`run ${runId} is not live`);
  // The run may have ended while its game server was being probed.
  if (catalog().find((run) => run.id === runId)?.ended !== false) throw new NextRunError(`run ${runId} is not live`);
  if (isExtension(action)) {
    const start = readStart(runsRoot, runId);
    if(action!=="extend_30m"&&action!=="extend_60m"&&start.extend_budget!==true) throw new NextRunError("this running build does not support this extension");
    if (start.extend_run !== true || start.controller?.kind === "human") throw new NextRunError("this run does not support extensions; start a run on the newer build");
  }
  const path = join(runDir(runsRoot, runId), "control.jsonl");
  const seq = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((line) => line !== "").length + 1 : 1;
  appendFileSync(path, `${controlLine(seq, action, now.toISOString())}\n`);
  return seq;
}

export interface LaunchSpec { readonly runId: string; readonly argv: readonly string[]; readonly env: Readonly<Record<string, string>>; readonly stdout: string; readonly stderr: string; readonly started?: (pid: number) => void }
export interface QueueHost {
  readonly runsRoot: string;
  readonly liveJs: string;
  readonly endpointFile: string | null;
  // The compute pool of the endpoint file's model server, whose gameplay lease a queued run takes.
  leasePool(): string;
  readonly gamePort: number;
  healthy: HealthProbe;
  now(): Date;
  random(): string;
  launch(spec: LaunchSpec): Promise<number | null>;
  // Whether a pid lives; a lease whose viewer and run are both gone is free again.
  alive?(pid: number): boolean;
}

export type QueueStatus =
  | { readonly state: "idle" }
  | { readonly state: "queued"; readonly runId: string; readonly waitingFor: string }
  | { readonly state: "launching" | "running"; readonly runId: string }
  | { readonly state: "failed"; readonly runId: string; readonly error: string };

export class RunQueue {
  private queued: { runId: string; draft: NextRun } | null = null;
  private ticking = false;
  private current: QueueStatus = { state: "idle" };
  constructor(private readonly host: QueueHost) {}

  status(): QueueStatus {
    return this.current;
  }

  enqueue(value: unknown): QueueStatus {
    if (this.host.endpointFile === null) throw new NextRunError("the viewer was started without a local model endpoint file");
    if (this.current.state === "queued") throw new NextRunError("a run is already queued; cancel it first");
    if (this.current.state === "launching" || this.current.state === "running") throw new NextRunError("a queued run is already launching or running");
    const draft = parseNextRun(value);
    if (draft.model === "") throw new NextRunError("choose a model for the next run");
    const runId = newRunId(this.host.now(), draft.model, () => this.host.random());
    presetFor(draft, runId);
    this.queued = { runId, draft };
    this.current = { state: "queued", runId, waitingFor: "checking" };
    return this.current;
  }

  cancel(): QueueStatus {
    if (this.current.state !== "queued") throw new NextRunError("nothing is queued");
    this.queued = null;
    this.current = { state: "idle" };
    return this.current;
  }

  // Launch the queued run once no run is live and no cohort holds the lease.
  // One tick at a time: health probes are awaited, so a timer tick or a cancel
  // can arrive meanwhile. The queued entry is re-read after the probes.
  async tick(): Promise<void> {
    if (this.ticking || this.queued === null || this.current.state !== "queued") return;
    this.ticking = true;
    try {
      await this.step();
    } finally {
      this.ticking = false;
    }
  }

  private async step(): Promise<void> {
    const { runsRoot } = this.host;
    const live = await liveRuns(runsRoot, (port) => this.host.healthy(port));
    const queued = this.queued;
    // A cancel during the probes clears the queued entry.
    if (queued === null) return;
    let pool: string;
    try {
      pool = this.host.leasePool();
    } catch (error) {
      this.current = { state: "queued", runId: queued.runId, waitingFor: `the model endpoint: ${(error as Error).message}` };
      return;
    }
    const lease = leaseDir(runsRoot, pool);
    const alive = (pid: number): boolean => (this.host.alive ?? pidAlive)(pid);
    const waitingFor = existsSync(lease) && !leaseStale(runsRoot, pool, alive) ? `the gameplay lease for ${pool}, held by ${leaseHolder(readLeaseOwner(runsRoot, pool))}` : live.length > 0 ? `live run ${live[0] ?? ""}` : null;
    if (waitingFor !== null) {
      this.current = { state: "queued", runId: queued.runId, waitingFor };
      return;
    }
    const { runId, draft } = queued;
    this.queued = null;
    try {
      takeLease(runsRoot, pool, { pid: process.pid, owner: "viewer-queue", run: runId }, alive);
    } catch (error) {
      if (!(error instanceof LeaseHeldError)) throw error;
      this.queued = { runId, draft };
      this.current = { state: "queued", runId, waitingFor: `the gameplay lease for ${pool}, held by ${leaseHolder(error.holder)}` };
      return;
    }
    this.current = { state: "launching", runId };
    try {
      const presets = join(viewerDir(runsRoot), "presets");
      const receipts = join(runsRoot, "launch-receipts", "viewer-queue");
      mkdirSync(presets, { recursive: true });
      mkdirSync(receipts, { recursive: true });
      const presetPath = join(presets, `${runId}.json`);
      writeFileSync(presetPath, `${JSON.stringify(presetFor(draft, runId), null, 2)}\n`, { flag: "wx" });
      const env: Record<string, string> = { POKEBENCH_PLAY_PRESET: presetPath, POKEBENCH_RUN_ID: runId, POKEBENCH_MODEL: draft.model, POKEBENCH_ENDPOINT_FILE: this.host.endpointFile ?? "", POKEBENCH_GAME_SERVER_URL: `http://127.0.0.1:${String(this.host.gamePort)}` };
      const started = (child: number): void => { nameLeaseRun(lease, { pid: process.pid, owner: "viewer-queue", run: runId, child }); };
      const launched = this.host.launch({ runId, argv: [this.host.liveJs, "play"], env, stdout: join(receipts, `${runId}.stdout.log`), stderr: join(receipts, `${runId}.stderr.log`), started });
      this.current = { state: "running", runId };
      const exit = await launched;
      this.current = exit === 0 ? { state: "idle" } : { state: "failed", runId, error: `play exited with ${exit === null ? "a signal" : `code ${String(exit)}`}; see runs/launch-receipts/viewer-queue/${runId}.stderr.log` };
    } catch (error) {
      this.current = { state: "failed", runId, error: error instanceof Error ? error.message : String(error) };
    } finally {
      rmSync(lease, { recursive: true, force: true });
    }
  }
}

// Production launch: argv only, explicit env, logs to the receipts directory.
export function spawnLaunch(spec: LaunchSpec, node = process.execPath): Promise<number | null> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) if (v !== undefined && k !== "POKEBENCH_PLAY_PRESET") env[k] = v;
  return spawnDetached(node, spec.argv, { env: { ...env, ...spec.env }, stdout: spec.stdout, stderr: spec.stderr, ...(spec.started === undefined ? {} : { started: spec.started }) });
}

export function randomSuffix(): string {
  return randomBytes(2).toString("hex");
}

export interface HumanRestartHost {
  readonly runsRoot: string;
  readonly liveJs: string;
  healthy: HealthProbe;
  now(): Date;
  random(): string;
  launch(spec: LaunchSpec): Promise<number | null>;
  wait?(ms: number): Promise<void>;
  readonly timeoutMs?: number;
  readonly pollMs?: number;
  readonly leasePath?: string;
  monotonic?(): number;
}
const RestartReceiptSchema = Type.Object({source:Type.String({pattern:RUN_ID_PATTERN}),runId:Type.String({pattern:RUN_ID_PATTERN}),state:Type.Enum(['launching','ready','failed'] as const),attempt:Type.Optional(positive),error:Type.Optional(Type.String())},{additionalProperties:false});
type RestartReceipt = Static<typeof RestartReceiptSchema>;

// A restart is a new recorded run. The original run is stopped through its owner,
// and its durable outcome and server drain precede any new emulator launch.
export class HumanRestarts {
  private active: { source: string; result: Promise<string> } | null = null;
  constructor(private readonly host: HumanRestartHost) {}

  restart(source: string): Promise<string> {
    if (this.active !== null) return this.active.source === source ? this.active.result : Promise.reject(new NextRunError('a human restart is busy'));
    const result = this.perform(source);
    this.active = {source,result};
    void result.then(()=>{this.active=null;},()=>{this.active=null;});
    return result;
  }

  private monotonic():number { return this.host.monotonic?.()??performance.now(); }
  private async until(check:()=>Promise<boolean>, message:string, deadline:number):Promise<void> {
    const step=this.host.pollMs??100;
    while(this.monotonic()<deadline){
      const ready=await check();
      if(this.monotonic()>=deadline)break;
      if(ready)return;
      await (this.host.wait?.(step)??new Promise<void>(resolve=>setTimeout(resolve,Math.min(step,Math.max(0,deadline-this.monotonic())))));
    }
    throw new NextRunError(`human restart timeout: ${message}`);
  }

  private async noOtherHuman(source:string):Promise<void> {
    for(const run of listRuns(this.host.runsRoot)){
      if(run.id===source||run.ended||run.problem!==null)continue;
      const start=readStart(this.host.runsRoot,run.id);
      if(start.controller?.kind==='human'&&await this.host.healthy(start.isolation.port))throw new NextRunError(`other human session ${run.id} is still live`);
    }
  }

  private async perform(source:string):Promise<string> {
    const {runsRoot}=this.host;
    const deadline=this.monotonic()+(this.host.timeoutMs??20_000);
    let start:ReturnType<typeof readStart>;
    try{start=readStart(runsRoot,source);}catch(error){throw new NextRunError(String(error));}
    if(start.controller?.kind!=='human')throw new NextRunError('restart requires a human run');
    if(start.start_state.kind!=='boot')throw new NextRunError('restart requires a boot-start human run');
    const dir=join(viewerDir(runsRoot),'human-restarts'),path=join(dir,`${source}.json`);
    mkdirSync(dir,{recursive:true});
    let receipt:RestartReceipt={source,runId:source,state:"launching"};
    const readReceipt=():RestartReceipt=>{let value:unknown;try{value=JSON.parse(readFileSync(path,'utf8'));}catch{throw new NextRunError('invalid human restart receipt');}if(!Value.Check(RestartReceiptSchema,value)||value.source!==source||value.runId===source)throw new NextRunError('invalid human restart receipt');return value;};
    const save=():void=>{writeFileSync(`${path}.tmp`,JSON.stringify(receipt)+'\n');renameSync(`${path}.tmp`,path);};
    let childFailure:string|null=null;
    const markChildFailure=(message:string):void=>{
      childFailure=message;
      // A late exit after an HTTP timeout still leaves a durable diagnosis.
      // Completed restarts keep their mapping when the playthrough later ends.
      try{const current=readReceipt();if(current.runId===receipt.runId&&current.state==='launching'){receipt={...current,state:'failed',error:message};save();}}catch{/* Launch log failures remain visible through the attached promise/error. */}
    };
    let retry:RestartReceipt|undefined;
    if(existsSync(path)){
      receipt=readReceipt();
      if(receipt.state==='ready')return receipt.runId;
      if(receipt.state==='failed'){
        const previous=listRuns(runsRoot).find(run=>run.id===receipt.runId);
        if(previous!==undefined&&!previous.ended)throw new NextRunError('failed human attempt has no terminal receipt; inspect launch receipts');
        if(await this.host.healthy(start.isolation.port)||(this.host.leasePath!==undefined&&existsSync(this.host.leasePath)))throw new NextRunError('failed human attempt is still draining; retry after server and lease release');
        retry=receipt;
      }
    }
    if(!existsSync(path)||retry!==undefined){
      await this.noOtherHuman(source);
      if(listRuns(runsRoot).find(run=>run.id===source)?.ended!==true)await appendControl(runsRoot,source,'stop',this.host.now(),this.host.healthy);
      await this.until(async()=>{const rows=readFrom(join(runDir(runsRoot,source),'events.jsonl'),0,0).results;if(rows.some(row=>!row.ok))throw new NextRunError('previous human log failed validation');const last=rows.at(-1);return last?.ok===true&&last.event.type==='run_end'&&last.event.run===source&&!await this.host.healthy(start.isolation.port)&&!(this.host.leasePath!==undefined&&existsSync(this.host.leasePath));},'previous run terminal/server/lease drain',deadline);
      await this.noOtherHuman(source);
      if(this.monotonic()>=deadline)throw new NextRunError('human restart timeout: before launch');
      const attempt=(retry?.attempt??(retry===undefined?0:1))+1;
      const runId=newRunId(this.host.now(),'human',()=>this.host.random()+(attempt>1?`-${String(attempt)}`:''));
      if(existsSync(runDir(runsRoot,runId)))throw new NextRunError('new human run id already exists');
      receipt={source,runId,state:'launching',attempt};
      if(retry!==undefined){writeFileSync(join(dir,`${source}.attempt-${String(retry.attempt??1)}.json`),JSON.stringify(retry)+'\n',{flag:'wx'});rmSync(path);}
      try{writeFileSync(path,JSON.stringify(receipt)+'\n',{flag:'wx'});}catch{receipt=readReceipt();if(receipt.state==='failed')throw new NextRunError(receipt.error??'human restart failed');if(receipt.state==='ready')return receipt.runId;await this.ready(receipt.runId,start.isolation.port,deadline);return receipt.runId;}
      const receipts=join(runsRoot,'launch-receipts','human-restart');mkdirSync(receipts,{recursive:true});
      const spec:LaunchSpec={runId,argv:[this.host.liveJs,'human'],env:{POKEBENCH_HUMAN_RUN_ID:runId,POKEBENCH_RUNS_ROOT:runsRoot,POKEBENCH_HUMAN_START_PAUSED:'true',POKEBENCH_HUMAN_VALIDATION:String(start.harness_features.includes('probe')),POKEBENCH_HUMAN_PORT:String(start.isolation.port)},stdout:join(receipts,`${runId}.stdout.log`),stderr:join(receipts,`${runId}.stderr.log`)};
      try{void this.host.launch(spec).then(code=>{markChildFailure(`human launch exited ${String(code)}; see ${spec.stderr}`);},(error:unknown)=>{markChildFailure(`human launch failed: ${String(error)}; see ${spec.stderr}`);});}catch(error){markChildFailure(`human launch failed: ${String(error)}; see ${spec.stderr}`);}
    }
    const observedFailure=():string|null=>{
      if(childFailure!==null)return childFailure;
      const current=readReceipt();
      return current.runId===receipt.runId&&current.state==='failed'?(current.error??'human restart failed'):null;
    };
    try{
      await this.ready(receipt.runId,start.isolation.port,deadline,observedFailure);
      const failed=observedFailure();if(failed!==null)throw new NextRunError(failed);
      receipt={...receipt,state:'ready'};save();return receipt.runId;
    }catch(error){
      const current=readReceipt();
      if(current.runId===receipt.runId&&current.state==='failed')throw new NextRunError(current.error??'human restart failed');
      const timeout=error instanceof NextRunError&&error.message.includes('restart timeout:');receipt={...receipt,state:timeout?'launching':'failed',error:String(error)};save();throw error;
    }
  }

  private async ready(runId:string,port:number,deadline:number,failure:()=>string|null=()=>null):Promise<void> {
    await this.until(async()=>{
      const failed=failure();if(failed!==null)throw new NextRunError(failed);
      const path=join(runDir(this.host.runsRoot,runId),'events.jsonl');if(!existsSync(path))return false;
      const results=readFrom(path,0,0).results;
      if(results.some(r=>!r.ok))throw new NextRunError('new human log failed validation');
      const events=results.flatMap(r=>r.ok?[r.event]:[]),first=events[0];
      if(first===undefined)return false;
      if(first.type!=='run_start'||first.run!==runId||first.controller?.kind!=='human'||first.start_state.kind!=='boot'||first.isolation.port!==port||events.some(e=>e.run!==runId))throw new NextRunError('new human launch identity failed validation');
      if(events.some(e=>e.type==='run_end'))throw new NextRunError('new human run ended before paused readiness');
      const control=events.filter(e=>e.type==='operator_control'&&e.status==='applied').at(-1);
      const paused = control?.type==='operator_control'&&control.action==='pause'&&control.emulator_frozen===true;
      const up=await this.host.healthy(port);const exited=failure();if(exited!==null)throw new NextRunError(exited);
      return paused&&up;
    },'new human paused readiness',deadline);
  }
}

Object.assign(DEFAULT_NEXT_RUN.features, {"move-learn-type-matchup-v1":false});

Object.assign(DEFAULT_NEXT_RUN.features, {"move-learn-type-matchup-v1":false,"instruction-memory-yaml-v1":false});

Object.assign(DEFAULT_NEXT_RUN.features, {"player-map-visibility-v2":false});
Object.assign(DEFAULT_NEXT_RUN.features, {"objective-graph-supervisor-v1":false,"story-route-plan-v1":false});
Object.assign(DEFAULT_NEXT_RUN.features, {"reasoning-effort-request-v1":true});
