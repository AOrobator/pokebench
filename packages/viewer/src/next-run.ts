// The next run: a draft edited in the switchboard, queued behind the live run
// (one local model), launched as an ordinary recorded play run with a v2
// preset under the shared gameplay lease. Operator controls for a live run are
// appended to its runs/<id>/control.jsonl, which the agent polls.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { ALL_ON, dependencyProblems } from "@pokebench/agent/features";
import { FeatureSetSchema, parsePlayPreset, type PlayPresetV2 } from "@pokebench/agent/play-preset";
import { controlLine, type ControlAction } from "@pokebench/agent/run-control";
import { newRunId } from "@pokebench/agent/run";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";
import { listRuns, readStart } from "./runs.js";

const positive = Type.Integer({ minimum: 1 });
export const NextRunSchema = Type.Object({
  model: Type.String({ maxLength: 200 }),
  thinking: Type.Enum(["off", "minimal", "low", "medium", "high", "xhigh"] as const),
  maxTurns: positive, maxWallMs: positive, failureLimit: positive, maxTokens: positive,
  target: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  features: FeatureSetSchema,
}, { additionalProperties: false });
export type NextRun = Static<typeof NextRunSchema>;

export const DEFAULT_NEXT_RUN: NextRun = { model: "", thinking: "medium", maxTurns: 300, maxWallMs: 30 * 60_000, failureLimit: 3, maxTokens: 4096, target: null, features: { ...ALL_ON } };
export const LEASE = ".naming-gameplay.lock";
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
  const problems = dependencyProblems(value.features);
  if (problems.length > 0) throw new NextRunError(`invalid next run: ${problems.join("; ")}`);
  return value;
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
export async function liveRuns(runsRoot: string, healthy: HealthProbe): Promise<string[]> {
  const candidates = listRuns(runsRoot).filter((run) => !run.ended && run.problem === null);
  const live = await Promise.all(candidates.map(async (run) => {
    try {
      return await healthy(readStart(runsRoot, run.id).isolation.port);
    } catch {
      return false;
    }
  }));
  return candidates.filter((_, i) => live[i] === true).map((run) => run.id);
}

export async function appendControl(runsRoot: string, runId: string, action: ControlAction, now: Date, healthy: HealthProbe): Promise<number> {
  if (!new RegExp(RUN_ID_PATTERN).test(runId) || !(await liveRuns(runsRoot, healthy)).includes(runId)) throw new NextRunError(`run ${runId} is not live`);
  // The run may have ended while its game server was being probed.
  if (listRuns(runsRoot).find((run) => run.id === runId)?.ended !== false) throw new NextRunError(`run ${runId} is not live`);
  const path = join(runsRoot, runId, "control.jsonl");
  const seq = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((line) => line !== "").length + 1 : 1;
  appendFileSync(path, `${controlLine(seq, action, now.toISOString())}\n`);
  return seq;
}

export interface LaunchSpec { readonly runId: string; readonly argv: readonly string[]; readonly env: Readonly<Record<string, string>>; readonly stdout: string; readonly stderr: string }
export interface QueueHost {
  readonly runsRoot: string;
  readonly liveJs: string;
  readonly endpointFile: string | null;
  readonly gamePort: number;
  healthy: HealthProbe;
  now(): Date;
  random(): string;
  launch(spec: LaunchSpec): Promise<number | null>;
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
    const lease = join(runsRoot, LEASE);
    const live = await liveRuns(runsRoot, (port) => this.host.healthy(port));
    const queued = this.queued;
    // A cancel during the probes clears the queued entry.
    if (queued === null) return;
    const waitingFor = existsSync(lease) ? "the gameplay lease (a benchmark cohort is running)" : live.length > 0 ? `live run ${live[0] ?? ""}` : null;
    if (waitingFor !== null) {
      this.current = { state: "queued", runId: queued.runId, waitingFor };
      return;
    }
    const { runId, draft } = queued;
    this.queued = null;
    try {
      mkdirSync(lease);
    } catch {
      this.queued = { runId, draft };
      this.current = { state: "queued", runId, waitingFor: "the gameplay lease" };
      return;
    }
    this.current = { state: "launching", runId };
    try {
      writeFileSync(join(lease, "owner.json"), JSON.stringify({ pid: process.pid, owner: "viewer-queue", run: runId }), { flag: "wx" });
      const presets = join(viewerDir(runsRoot), "presets");
      const receipts = join(runsRoot, "launch-receipts", "viewer-queue");
      mkdirSync(presets, { recursive: true });
      mkdirSync(receipts, { recursive: true });
      const presetPath = join(presets, `${runId}.json`);
      writeFileSync(presetPath, `${JSON.stringify(presetFor(draft, runId), null, 2)}\n`, { flag: "wx" });
      const env: Record<string, string> = { POKEBENCH_PLAY_PRESET: presetPath, POKEBENCH_RUN_ID: runId, POKEBENCH_MODEL: draft.model, POKEBENCH_ENDPOINT_FILE: this.host.endpointFile ?? "", POKEBENCH_GAME_SERVER_URL: `http://127.0.0.1:${String(this.host.gamePort)}` };
      const launched = this.host.launch({ runId, argv: [this.host.liveJs, "play"], env, stdout: join(receipts, `${runId}.stdout.log`), stderr: join(receipts, `${runId}.stderr.log`) });
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
  const inherited = { ...process.env };
  delete inherited["POKEBENCH_PLAY_PRESET"];
  return new Promise((resolve, reject) => {
    const out = openSync(spec.stdout, "wx", 0o600);
    let err: number;
    try {
      err = openSync(spec.stderr, "wx", 0o600);
    } catch (error) {
      closeSync(out);
      throw error;
    }
    // The child holds its own copies; the parent closes its descriptors.
    const child = spawn(node, [...spec.argv], { env: { ...inherited, ...spec.env }, stdio: ["ignore", out, err] });
    closeSync(out);
    closeSync(err);
    child.once("error", reject);
    child.once("exit", (code) => { resolve(code); });
  });
}

export function randomSuffix(): string {
  return randomBytes(2).toString("hex");
}
