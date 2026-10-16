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
import { controlLine, type ControlAction } from "@pokebench/agent/run-control";
import { newRunId } from "@pokebench/agent/run";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";
import { spawnDetached } from "./detached.js";
import { LEASE, LeaseHeldError, leaseStale, nameLeaseRun, pidAlive, takeLease } from "./lease.js";
import { listRuns, readStart, readFrom, runDir } from "./runs.js";

const positive = Type.Integer({ minimum: 1 });
export const NextRunSchema = Type.Object({
  model: Type.String({ maxLength: 200 }),
  thinking: Type.Enum(["off", "minimal", "low", "medium", "high", "xhigh"] as const),
  maxTurns: positive, maxWallMs: positive, failureLimit: positive, maxTokens: positive,
  target: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  features: FeatureSetSchema,
}, { additionalProperties: false });
export type NextRun = Omit<Static<typeof NextRunSchema>, "features"> & {features:FeatureSet};

export const DEFAULT_NEXT_RUN: NextRun = { model: "", thinking: "medium", maxTurns: 300, maxWallMs: 30 * 60_000, failureLimit: 3, maxTokens: 4096, target: null, features: { ...ALL_ON, "state-only-decisions-v1":false, "explorer-guidance-v1": false, "in-game-naming-readout-v1": false, "no-nickname-guidance-v1": false, "battle-message-waiting-v1": false, "connection-edge-tiles-v1": false, "named-interactions-v1": false, "world-destinations-v1": false, "bounded-navigation-v1": false, "full-map-navigation-v1": false, "grass-cost-navigation-v1": false, "game-evidence-priority-v1": false, "dialogue-log-v1": false, "loop-guard-supervisor-v1": false, "instruction-ledger-v1": false, "next-milestone-hint-v1": false, "double-context-window-v1": false, "fresh-retry-v1": false, "named-warp-destinations-v1": false, "milestone-stall-stop-v1": false, "text-only-supervisor-v1": false, "character-presence-v1": false, "navigation-refusal-reasons-v1": false, "transition-press-result-v1": false, "stall-briefing-v1": false, "battle-details-v2": false, "dialogue-auto-advance-v1": false, "warp-arrival-settle-v1": false, "dialogue-context-kept-v1": false, "displayed-place-names-v1": false, "transition-loop-detection-v1": false, "blocked-batch-result-v1": false, "adjacent-tiles-v1": false,"battle-triage-guidance-v1":false, "readout-rules-in-prompt-v1": false, "script-line-presence-v1": false, "offscreen-objects-v1": false, "navigate-first-prompt-v1": false, "presence-penalty-v1": false, "disproved-beliefs-v1": false, "same-plan-breaker-v1": false, "trainer-heal-guidance-v1": false, "low-hp-trainer-warning-v1": false , "battle-text-auto-advance-v1": false } };
export { LEASE } from "./lease.js";
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
    const lease = join(runsRoot, LEASE);
    const live = await liveRuns(runsRoot, (port) => this.host.healthy(port));
    const queued = this.queued;
    // A cancel during the probes clears the queued entry.
    if (queued === null) return;
    const alive = (pid: number): boolean => (this.host.alive ?? pidAlive)(pid);
    const waitingFor = existsSync(lease) && !leaseStale(runsRoot, alive) ? "the gameplay lease (a benchmark cohort is running)" : live.length > 0 ? `live run ${live[0] ?? ""}` : null;
    if (waitingFor !== null) {
      this.current = { state: "queued", runId: queued.runId, waitingFor };
      return;
    }
    const { runId, draft } = queued;
    this.queued = null;
    try {
      takeLease(runsRoot, { pid: process.pid, owner: "viewer-queue", run: runId }, alive);
    } catch (error) {
      if (!(error instanceof LeaseHeldError)) throw error;
      this.queued = { runId, draft };
      this.current = { state: "queued", runId, waitingFor: "the gameplay lease" };
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
