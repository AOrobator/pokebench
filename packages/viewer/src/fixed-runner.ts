// One process, one lane per GPU: each lane plays its own queue of the frozen plan on its own
// game port and model endpoint, and the two lanes run concurrently. Nothing here ends the
// experiment: a lane that cannot play pauses, says why in status.json, and retries with
// backoff while the other lane goes on. Only the operator stops the runner.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { armPreset, definitionProblems, FIXED_ARMS, phaseOf, type FixedArm, type FixedDefinition, type FixedLane } from "./fixed-design.js";
import { appendLedger, classifyTrial, nextFor, progress, queueState, readLedger, type FixedLedgerEntry, type FixedOutcome, type Progress, type QueueSlot } from "./fixed-ledger.js";
import { writeFixedStatus, type FixedLaneStatus, type FixedStatus } from "./fixed-status.js";
import { LeaseHeldError, nameLeaseRun, readLeaseOwner, takeLease } from "./lease.js";
import { runnerPath } from "./experiment-store.js";

export class FixedRunError extends Error {
  override readonly name = "FixedRunError";
}

export interface ServingReceipt {
  readonly model: string;
  readonly build: string;
  readonly contextTokens: number;
  readonly slots: number;
  readonly vision: boolean;
  readonly fingerprint: string;
}

export interface FixedLaunch {
  readonly lane: string;
  readonly slot: number;
  readonly arm: FixedArm;
  readonly phase: string;
  readonly runId: string;
  readonly presetPath: string;
  readonly env: Readonly<Record<string, string>>;
  readonly stdout: string;
  readonly stderr: string;
  started(pid: number): void;
}

export interface FixedHost {
  now(): Date;
  sleep(ms: number): Promise<void>;
  head(): string;
  sources(commit: string): string | null;
  verifyBuild(commit: string): Promise<string | null>;
  serving(lane: FixedLane): Promise<ServingReceipt>;
  portInUse(port: number): Promise<boolean>;
  runId(lane: FixedLane): string;
  launch(launch: FixedLaunch): Promise<number | null>;
  alive(pid: number): boolean;
  log(line: string): void;
}

export interface FixedRunOptions {
  readonly def: FixedDefinition;
  readonly definitionSha256: string;
  readonly runsRoot: string;
  readonly host: FixedHost;
  readonly stopRequested: () => boolean;
  readonly pid: number;
  // A dry run finishes once its planned trials ran, replaced or not.
  readonly dryRun?: boolean;
}

export const BACKOFF_MS = [30_000, 60_000, 120_000, 300_000, 600_000] as const;
export const POLL_MS = 30_000;
export const ADOPT_POLL_MS = 5_000;

const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

interface Child { readonly slot: number; readonly run: string; readonly pid: number }

class Runner {
  private readonly dir: string;
  private readonly ledgerPath: string;
  private readonly lanes = new Map<string, FixedLaneStatus>();
  private readonly children = new Map<string, Child>();
  private readonly presetShas = new Map<string, string>();
  private readonly receipts = new Map<string, ServingReceipt>();
  private state: FixedStatus["state"] = "waiting";
  private lastError: string | null = null;
  private lastProgress: Progress | null = null;
  private lease: string | null = null;
  private buildCheck: Promise<unknown> = Promise.resolve();

  constructor(private readonly o: FixedRunOptions) {
    this.dir = join(o.runsRoot, "experiments", o.def.id);
    this.ledgerPath = join(this.dir, "trials.jsonl");
    const now = o.host.now().toISOString();
    for (const lane of o.def.lanes) {
      this.lanes.set(lane.id, { id: lane.id, gpu: lane.gpu, port: lane.gamePort, state: "starting", reason: "starting", slot: null, arm: null, phase: null, run: null, since: now, retryAt: null, lastError: null, valid: 0, total: 0 });
    }
  }

  async run(): Promise<"finished" | "stopped"> {
    this.prepare();
    try {
      if (!(await this.acquireLease())) return this.finish("stopped");
      this.state = "running";
      this.writeStatus();
      const done = await Promise.all(this.o.def.lanes.map((lane) => this.laneLoop(lane)));
      return this.finish(done.every(Boolean) ? "finished" : "stopped");
    } finally {
      if (this.lease !== null) rmSync(this.lease, { recursive: true, force: true });
      this.children.clear();
      this.writeRunner();
    }
  }

  private prepare(): void {
    mkdirSync(join(this.dir, "presets"), { recursive: true });
    mkdirSync(join(this.dir, "endpoints"), { recursive: true });
    mkdirSync(join(this.dir, "logs"), { recursive: true });
    for (const phase of this.o.def.phases) {
      for (const arm of FIXED_ARMS) {
        const text = `${JSON.stringify(armPreset(this.o.def, phase.id, arm), null, 1)}\n`;
        writeFileSync(this.presetPath(phase.id, arm), text);
        this.presetShas.set(`${phase.id}-${arm}`, sha256(text));
      }
    }
    for (const lane of this.o.def.lanes) writeFileSync(this.endpointPath(lane), `${JSON.stringify({ base_url: `${lane.modelUrl}/v1`, api_key: "unused" })}\n`);
  }

  private presetPath(phase: string, arm: string): string { return join(this.dir, "presets", `${phase}-${arm}.json`); }
  private endpointPath(lane: FixedLane): string { return join(this.dir, "endpoints", `${lane.id}.json`); }

  private finish(state: "finished" | "stopped"): "finished" | "stopped" {
    this.state = state;
    this.writeStatus();
    this.o.host.log(`${this.o.def.id}: ${state}`);
    return state;
  }

  private unfinishedRuns(): Set<string> {
    const state = queueState(this.o.def, this.ledger());
    return new Set([...state.launches.values()].filter((l) => !state.outcomes.has(l.slot)).map((l) => l.run));
  }

  private async acquireLease(): Promise<boolean> {
    for (;;) {
      try {
        this.lease = takeLease(this.o.runsRoot, { pid: this.o.pid, owner: `fixed-run:${this.o.def.id}` }, (pid) => this.o.host.alive(pid), this.unfinishedRuns());
        return true;
      } catch (error) {
        if (!(error instanceof LeaseHeldError)) throw error;
      }
      const owner = readLeaseOwner(this.o.runsRoot);
      const reason = `waiting for the gameplay lease, held by ${owner === null ? "an unreadable owner" : `${owner.owner} (pid ${String(owner.pid)})`}`;
      for (const lane of this.o.def.lanes) this.setLane(lane.id, { state: "waiting", reason, retryAt: null });
      if (this.o.stopRequested()) return false;
      await this.o.host.sleep(POLL_MS);
    }
  }

  private ledger(): FixedLedgerEntry[] {
    return readLedger(this.ledgerPath);
  }

  private append(entry: FixedLedgerEntry): void {
    appendLedger(this.ledgerPath, entry);
  }

  private async laneLoop(lane: FixedLane): Promise<boolean> {
    let failures = 0;
    for (;;) {
      let state;
      try {
        state = queueState(this.o.def, this.ledger());
      } catch (error) {
        failures += 1;
        await this.pause(lane, `ledger unreadable: ${message(error)}`, failures);
        continue;
      }
      const running = state.slots.find((s) => s.lane === lane.id && state.launches.has(s.slot) && !state.outcomes.has(s.slot));
      if (running !== undefined) {
        await this.adopt(lane, running, state.started.get(running.slot)?.pid ?? null);
        continue;
      }
      if (this.o.stopRequested()) {
        this.setLane(lane.id, { state: "stopped", reason: "stopped by the operator: no new trials start", slot: null, arm: null, phase: null, run: null, retryAt: null });
        return false;
      }
      const step = nextFor(this.o.def, state, lane.id);
      if (step.kind === "done" || (this.o.dryRun === true && step.kind === "blocked")) {
        this.setLane(lane.id, { state: "done", reason: "every trial planned for this lane has run", slot: null, arm: null, phase: null, run: null, retryAt: null });
        return true;
      }
      if (step.kind !== "slot") {
        this.setLane(lane.id, { state: step.kind === "wait" ? "waiting" : "paused", reason: step.reason, slot: null, arm: null, phase: null, run: null, retryAt: new Date(this.o.host.now().getTime() + POLL_MS).toISOString() });
        await this.o.host.sleep(POLL_MS);
        continue;
      }
      const problem = await this.preflight(lane);
      if (problem !== null) {
        failures += 1;
        await this.pause(lane, problem, failures);
        continue;
      }
      const outcome = await this.play(lane, step.slot);
      if (outcome.valid) {
        failures = 0;
        continue;
      }
      failures += 1;
      await this.pause(lane, `invalid trial: ${outcome.reason}`, failures, outcome.reason);
    }
  }

  private async pause(lane: FixedLane, reason: string, failures: number, error = reason): Promise<void> {
    const wait = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1] ?? POLL_MS;
    this.lastError = `lane ${lane.id}: ${error}`;
    this.o.host.log(`${this.o.def.id} lane ${lane.id} paused: ${reason}`);
    this.setLane(lane.id, { state: "paused", reason, slot: null, arm: null, phase: null, run: null, lastError: error, retryAt: new Date(this.o.host.now().getTime() + wait).toISOString() });
    await this.o.host.sleep(wait);
  }

  private firstCommit(): string {
    const first = this.ledger().find((e) => e.kind === "launch");
    return first?.kind === "launch" ? first.commit : this.o.host.head();
  }

  // Both lanes check the build in turn, so they never rebuild it at the same time.
  private checkBuild(): Promise<string | null> {
    const check = this.buildCheck.then(() => this.o.host.verifyBuild(this.firstCommit()));
    this.buildCheck = check.catch(() => undefined);
    return check;
  }

  private async preflight(lane: FixedLane): Promise<string | null> {
    let build: string | null;
    try {
      build = await this.checkBuild();
    } catch (error) {
      build = message(error);
    }
    if (build !== null) return `build check: ${build}`;
    let receipt: ServingReceipt;
    try {
      receipt = await this.o.host.serving(lane);
    } catch (error) {
      return `lane ${lane.id} cannot serve: ${message(error)}`;
    }
    const plan = this.o.def.serving;
    const wrong = [
      receipt.model === plan.model ? null : `model ${receipt.model} (planned ${plan.model})`,
      receipt.build === plan.build ? null : `build ${receipt.build} (planned ${plan.build})`,
      receipt.contextTokens === plan.contextTokens ? null : `context ${String(receipt.contextTokens)} tokens (planned ${String(plan.contextTokens)})`,
      receipt.slots === plan.slots ? null : `${String(receipt.slots)} slots (planned ${String(plan.slots)})`,
      receipt.vision ? null : "no vision input",
    ].filter((w) => w !== null);
    if (wrong.length > 0) return `lane ${lane.id} serves ${wrong.join("; ")}`;
    if (await this.o.host.portInUse(lane.gamePort)) return `game port ${String(lane.gamePort)} is already in use`;
    this.receipts.set(lane.id, receipt);
    return null;
  }

  private expectation(lane: FixedLane, slot: QueueSlot) {
    return { maxWallMs: phaseOf(this.o.def, slot.phase).maxWallMs, primary: this.o.def.primaryMilestone, presetId: armPreset(this.o.def, slot.phase, slot.arm).id, startSha1: this.o.def.start.sha1, port: lane.gamePort, model: this.o.def.serving.model };
  }

  private events(run: string): string | null {
    const path = join(this.o.runsRoot, run, "events.jsonl");
    return existsSync(path) ? readFileSync(path, "utf8") : null;
  }

  private record(lane: FixedLane, slot: QueueSlot, run: string, outcome: FixedOutcome): FixedOutcome {
    this.append({ kind: "outcome", slot: slot.slot, run, at: this.o.host.now().toISOString(), ...outcome });
    this.o.host.log(`${this.o.def.id} #${String(slot.slot)} lane ${lane.id} ${slot.arm}: ${outcome.valid ? "valid" : "INVALID"}, ${outcome.reason}`);
    this.setLane(lane.id, { state: "running", reason: `trial ${String(slot.slot)} recorded: ${outcome.valid ? "valid" : "invalid"}, ${outcome.reason}`, slot: null, arm: null, phase: null, run: null, retryAt: null });
    return outcome;
  }

  private async play(lane: FixedLane, slot: QueueSlot): Promise<FixedOutcome> {
    const run = this.o.host.runId(lane);
    const commit = this.firstCommit();
    this.append({
      kind: "launch", slot: slot.slot, lane: lane.id, phase: slot.phase, arm: slot.arm, run, at: this.o.host.now().toISOString(),
      commit, sources: this.o.host.sources(commit) ?? "unknown", presetSha256: this.presetShas.get(`${slot.phase}-${slot.arm}`) ?? "", serving: this.receipts.get(lane.id)?.fingerprint ?? "",
      ...(slot.replaces === null ? {} : { replaces: slot.replaces }),
    });
    this.setLane(lane.id, { state: "running", reason: `trial ${String(slot.slot)} (${slot.phase}, ${slot.arm})${slot.replaces === null ? "" : `, replacing #${String(slot.replaces)}`}`, slot: slot.slot, arm: slot.arm, phase: slot.phase, run, retryAt: null });
    const env = {
      POKEBENCH_MODEL: this.o.def.serving.model,
      POKEBENCH_ENDPOINT_FILE: this.endpointPath(lane),
      POKEBENCH_GAME_SERVER_URL: `http://127.0.0.1:${String(lane.gamePort)}`,
      POKEBENCH_PLAY_PRESET: this.presetPath(slot.phase, slot.arm),
      POKEBENCH_RUN_ID: run,
      POKEBENCH_EXPERIMENT: JSON.stringify({ id: this.o.def.id, arm: slot.arm, trial: slot.slot, of: Math.max(this.o.def.plan.length, slot.slot) }),
    };
    let exit: number | null | undefined;
    let launchError: string | null = null;
    try {
      exit = await this.o.host.launch({
        lane: lane.id, slot: slot.slot, arm: slot.arm, phase: slot.phase, runId: run, presetPath: env.POKEBENCH_PLAY_PRESET, env,
        stdout: join(this.dir, "logs", `${run}.out`), stderr: join(this.dir, "logs", `${run}.err`),
        started: (pid) => {
          this.append({ kind: "started", slot: slot.slot, run, pid, at: this.o.host.now().toISOString() });
          this.children.set(lane.id, { slot: slot.slot, run, pid });
          this.writeRunner();
        },
      });
    } catch (error) {
      launchError = message(error);
    }
    this.children.delete(lane.id);
    this.writeRunner();
    const outcome = classifyTrial(this.events(run), this.expectation(lane, slot), exit);
    return this.record(lane, slot, run, launchError === null ? outcome : { ...outcome, valid: false, reason: `launch failed: ${launchError}` });
  }

  private async adopt(lane: FixedLane, slot: QueueSlot, pid: number | null): Promise<void> {
    const launch = queueState(this.o.def, this.ledger()).launches.get(slot.slot);
    const run = launch?.run ?? "";
    if (pid !== null && this.o.host.alive(pid)) {
      this.children.set(lane.id, { slot: slot.slot, run, pid });
      this.writeRunner();
      this.setLane(lane.id, { state: "running", reason: `trial ${String(slot.slot)} (${slot.phase}, ${slot.arm}) adopted from an earlier runner`, slot: slot.slot, arm: slot.arm, phase: slot.phase, run, retryAt: null });
      while (this.o.host.alive(pid)) await this.o.host.sleep(ADOPT_POLL_MS);
      this.children.delete(lane.id);
      this.writeRunner();
    }
    this.record(lane, slot, run, classifyTrial(this.events(run), this.expectation(lane, slot), undefined));
  }

  // runner.json names a running trial while any plays (merges into main wait on it); the lease names it too.
  private writeRunner(): void {
    const latest = [...this.children.values()].at(-1);
    const path = runnerPath(this.o.runsRoot);
    if (latest === undefined) {
      if (existsSync(path)) {
        try {
          if ((JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown }).pid === this.o.pid) rmSync(path, { force: true });
        } catch {
          // Someone else's unreadable runner file stays.
        }
      }
    } else {
      mkdirSync(join(this.o.runsRoot, "experiments"), { recursive: true });
      writeFileSync(path, JSON.stringify({ pid: this.o.pid, experiment: this.o.def.id, trial: latest.slot, run: latest.run, child: latest.pid }));
    }
    if (this.lease !== null) nameLeaseRun(this.lease, { pid: this.o.pid, owner: `fixed-run:${this.o.def.id}`, ...(latest === undefined ? {} : { run: latest.run, child: latest.pid }) });
  }

  private setLane(id: string, change: Partial<FixedLaneStatus>): void {
    const lane = this.lanes.get(id);
    if (lane === undefined) return;
    const moved = change.state !== undefined && change.state !== lane.state;
    this.lanes.set(id, { ...lane, ...change, since: moved ? this.o.host.now().toISOString() : lane.since });
    this.writeStatus();
  }

  private writeStatus(): void {
    try {
      this.lastProgress = progress(this.o.def, queueState(this.o.def, this.ledger()));
    } catch {
      // An unreadable ledger keeps the last counts; the lanes say why they paused.
    }
    const p = this.lastProgress;
    const lanes = [...this.lanes.values()].map((l) => ({ ...l, valid: p?.lanes[l.id]?.valid ?? 0, total: p?.lanes[l.id]?.total ?? 0 }));
    writeFixedStatus(this.o.runsRoot, {
      kind: "fixed-run", version: 1, experiment: this.o.def.id, title: this.o.def.title, definitionSha256: this.o.definitionSha256, pid: this.o.pid,
      updatedAt: this.o.host.now().toISOString(), state: this.state,
      total: this.o.def.plan.length, valid: p?.valid ?? 0, invalid: p?.invalid ?? 0, invalidTrials: [...(p?.invalidTrials ?? [])],
      reserve: { usedMs: p?.reserveUsedMs ?? 0, totalMs: this.o.def.replacementReserveMs },
      lanes, lastError: this.lastError,
    });
  }
}

export async function runFixed(o: FixedRunOptions): Promise<"finished" | "stopped"> {
  const problems = definitionProblems(o.def);
  if (problems.length > 0) throw new FixedRunError(problems.join("\n"));
  return new Runner(o).run();
}
