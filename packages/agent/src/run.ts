import {createHash} from "node:crypto";
import {checkEvent,type RunEvent} from "./events.js";
import { existsSync,writeFileSync } from "node:fs";
import { RUN_ID_PATTERN } from "./events.js";
import { dirname, join, resolve } from "node:path";
import type { BodyOf, RunEndReason } from "./events.js";
import type { FrameStore } from "./frames.js";
import type { StateSource } from "./game-state.js";
import type { MilestoneSource } from "./milestones.js";
import { RunRecorder, type RunStartMeta } from "./recorder.js";
import { RunLog, easternTimestamp } from "./run-log.js";

type RunStart = BodyOf<"run_start">;

export const HUMAN_GAMEPLAY_LEASE_NAME = ".human-gameplay.lock";
export function humanLeasePath(repoRoot: string, commonDir: string): string {
  return join(dirname(resolve(repoRoot, commonDir)), "runs", HUMAN_GAMEPLAY_LEASE_NAME);
}

export interface RunPlan {
  readonly extend_run?: true;
  readonly extend_budget?: true;
  readonly continuation?:{readonly prior:readonly RunEvent[];readonly sourceTurn:number;readonly sourceRun:string;readonly prefix:string};
  readonly runsRoot: string;
  readonly runId: string;
  readonly port: number;
  readonly model: RunStart["model"];
  readonly sampling: RunStart["sampling"];
  readonly systemPrompt: string;
  readonly tools: readonly string[];
  readonly startState: RunStart["start_state"];
  readonly harnessFeatures: readonly string[];
  readonly budgets: RunStart["budgets"];
  readonly piVersion: string;
  readonly evaluation?:RunStart["evaluation"];
  readonly controller?:RunStart["controller"];
  readonly romSha1?:string;
}

export interface ServerHandle {
  readonly serverDir: string;
  stop(): Promise<void>;
}

export interface RunHost {
  serverHealthy(url: string): Promise<boolean>;
  launchServer(runDir: string, runId: string, port: number): Promise<ServerHandle>;
  harness(): RunStart["harness"];
  vendorPin(): string;
  readonly milestones: MilestoneSource;
  readonly gameState: StateSource;
}

export function newRunId(now: Date, modelId: string, random: () => string): string {
  const stamp = easternTimestamp(now).slice(0, 19).replace(/:/g, "-");
  const model = modelId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${stamp}_${model}_${random()}`;
}

export function harnessInfo(git: (args: string[]) => string): RunStart["harness"] {
  return {
    commit: git(["rev-parse", "HEAD"]).trim(),
    dirty: git(["status", "--porcelain"]).trim() !== "",
  };
}

export interface RunLifecycle {beforeRunEnd(task:()=>Promise<void>):void}

async function finishRecording(recorder:RunRecorder,reason:RunEndReason,capture:boolean,tasks:readonly (()=>Promise<void>)[]):Promise<void>{
  let terminal=reason,failure:Error|undefined;
  const asError=(value:unknown):Error=>value instanceof Error?value:new Error(String(value));
  try {if(capture)await recorder.afterPress();} catch(error){terminal="crash";failure=asError(error);}
  for(const task of tasks){try {await task();} catch(error){terminal="crash";failure??=asError(error);}}
  recorder.end(terminal);
  if(failure!==undefined)throw failure;
}

export async function withRun(
  plan: RunPlan,
  host: RunHost,
  frames: FrameStore,
  body: (recorder: RunRecorder, gameServerUrl: string, start:RunStartMeta, lifecycle:RunLifecycle) => Promise<RunEndReason>,
): Promise<RunEndReason> {
  if(plan.continuation!==undefined){
    const c=plan.continuation;
    const parsed=c.prefix.split("\n").filter(line=>line.trim()!=="").map(line=>checkEvent(JSON.parse(line) as unknown));
    if(!Number.isSafeInteger(c.sourceTurn)||c.sourceTurn<1||parsed.length===0||JSON.stringify(parsed)!==JSON.stringify(c.prior)||c.prior.some((e,i)=>e.run!==c.sourceRun||e.type==="run_end"||e.seq<=(c.prior[i-1]?.seq??-1))||plan.startState.kind!=="save_state")throw new Error("invalid continuation provenance");
  }
  frames.assertCanStart();
  const url = `http://127.0.0.1:${String(plan.port)}`;
  if (await host.serverHealthy(url)) {
    throw new Error(`a game server is already running on ${url}; every run needs its own (INV-7)`);
  }
  const harness = host.harness();
  const vendorPin = host.vendorPin();
  const prior=plan.continuation?.prior??[];
  const log = RunLog.create(plan.runsRoot, plan.runId,()=>new Date(),(prior.at(-1)?.seq??0)+1);
  if(plan.continuation!==undefined)writeFileSync(join(log.runDir,"restoration-prefix.jsonl"),plan.continuation.prefix,{flag:"wx"});
  let server: ServerHandle | undefined;
  const beforeRunEnd:(()=>Promise<void>)[]=[];
  if (plan.controller === undefined) server = await host.launchServer(log.runDir, plan.runId, plan.port);
  const recorder = new RunRecorder({ log, frames, milestones: host.milestones, gameState: host.gameState,...(plan.continuation===undefined?{}:{history:prior,turnBase:plan.continuation.sourceTurn-1,restoreRunIdentity:plan.harnessFeatures.includes("restored-memory-run-v1")}) });
  let reason: RunEndReason = "crash";
  try {
    const startMeta:RunStartMeta={
      ...(plan.continuation===undefined?{}:{restoration:{source_run:plan.continuation.sourceRun,source_turn:plan.continuation.sourceTurn,prefix_sha256:createHash("sha256").update(plan.continuation.prefix).digest("hex"),prefix_last_seq:prior.at(-1)?.seq??0}}),
      ...(plan.romSha1 === undefined ? {} : {rom_sha1:plan.romSha1}),
      ...(plan.controller === undefined ? {} : {controller: plan.controller}),
      ...(plan.evaluation===undefined?{}:{evaluation:plan.evaluation}),
      model: plan.model,
      sampling: plan.sampling,
      system_prompt: plan.systemPrompt,
      tools: [...plan.tools],
      harness,
      vendor_pin: vendorPin,
      pi_version: plan.piVersion,
      start_state: plan.startState,
      harness_features: [...plan.harnessFeatures],
      ...(plan.extend_run === true ? { extend_run: true as const } : {}),
      ...(plan.extend_budget === true ? { extend_budget:true as const } : {}),
      budgets: plan.budgets,
      isolation: { server_dir: server?.serverDir ?? join(log.runDir, "server"), run_data_id: plan.runId, load_checkpoint_mode: false, port: plan.port },
    };
    await recorder.start(startMeta, plan.controller === undefined&&plan.continuation===undefined);
    if (plan.controller !== undefined) {
      server = await host.launchServer(log.runDir, plan.runId, plan.port);
      await recorder.checkMilestones();
    }
    reason = await body(recorder,url,startMeta,{beforeRunEnd:(task)=>{beforeRunEnd.push(task);}});
    return reason;
  } finally {
    try {
      if (log.nextSeq > 0 && !log.ended) {
        // A script can commit progress after the last tool's captured frame.
        // Take one final snapshot before teardown; no inputs or polling loop.
        await finishRecording(recorder,reason,server!==undefined,beforeRunEnd);
      }
    } finally {
      await server?.stop();
    }
  }
}

// Human recordings live below a separate physical root, while inspection shares ids.
export function locateRunDir(runsRoot:string,runId:string):string {
  if(!new RegExp(RUN_ID_PATTERN).test(runId))throw new Error(`not a run id: ${JSON.stringify(runId)}`);
  const model=join(runsRoot,runId),human=join(runsRoot,"human",runId);
  if(existsSync(model)&&existsSync(human))throw new Error(`ambiguous run id: ${runId}`);
  return existsSync(human)?human:model;
}
