import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ALL_ON } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
import { processGroup } from "../test-support/process-group.js";
import { DEFAULT_NEXT_RUN, LEASE, NextRunError, RunQueue, appendControl, healthProbe, liveRuns, presetFor, readDraft, spawnLaunch, writeDraft, type LaunchSpec, type QueueHost } from "./next-run.js";

const NOW = new Date("2026-10-13T16:00:00.000Z");
function root(): string { return mkdtempSync(join(tmpdir(), "next-run-")); }
// Game servers that answer /health in these tests.
const UP = new Set([9001, 9003]);
const healthy = (port: number): Promise<boolean> => Promise.resolve(UP.has(port));
function liveRun(runsRoot: string, id: string, ended = false, port = 9001, tail: "none" | "paused" = "none"): void {
  const log = new Log(); log.add(0, { ...START, isolation: { ...START.isolation, port } });
  if (tail === "paused") log.add(1, { type: "operator_control", turn: 0, action: "pause", status: "applied", request: 1, emulator_frozen: true });
  if (ended) log.add(2, { type: "run_end", turn: 0, reason: "budget", furthest_milestone: null, turns: 0, wall_ms: 1, tokens: { input: 0, output: 0 }, frames: { saved: 0, bytes: 0 } });
  mkdirSync(join(runsRoot, id), { recursive: true });
  writeFileSync(join(runsRoot, id, "events.jsonl"), log.events.map((e) => JSON.stringify({ ...e, run: id })).join("\n") + "\n");
}
const draft = { ...DEFAULT_NEXT_RUN, model: "Qwen3.8-Flash" };

describe("next-run draft", () => {
  it("defaults, persists and rejects malformed or dependency-breaking drafts", () => {
    const runsRoot = root();
    expect(readDraft(runsRoot)).toEqual(DEFAULT_NEXT_RUN);
    expect(DEFAULT_NEXT_RUN.features["connection-edge-tiles-v1"]).toBe(false);
    expect(writeDraft(runsRoot, draft)).toEqual(draft);
    expect(readDraft(runsRoot)).toEqual(draft);
    expect(() => writeDraft(runsRoot, { ...draft, features: { ...ALL_ON, "state-only-decisions-v1": false, "live-map-v1": false } })).toThrow(/world-coordinate-grid-v1 needs live-map-v1/);
    expect(() => writeDraft(runsRoot, { ...draft, extra: 1 })).toThrow(NextRunError);
    writeFileSync(join(runsRoot, ".viewer", "next-run.json"), "garbage");
    expect(readDraft(runsRoot)).toEqual(DEFAULT_NEXT_RUN);
  });

  it("turns a draft into a v2 play preset", () => {
    expect(presetFor({ ...draft, target: "RIVAL_MET" }, "r1")).toEqual({ version: 2, id: "viewer-r1", target: "RIVAL_MET", limits: { maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: { ...ALL_ON, "state-only-decisions-v1": false, "named-interactions-v1": false, "world-destinations-v1": false, "bounded-navigation-v1": false, "full-map-navigation-v1": false, "grass-cost-navigation-v1": false, "game-evidence-priority-v1": false, "dialogue-log-v1": false, "loop-guard-supervisor-v1": false, "instruction-ledger-v1": false, "next-milestone-hint-v1": false, "double-context-window-v1": false, "fresh-retry-v1": false, "named-warp-destinations-v1": false, "milestone-stall-stop-v1": false, "text-only-supervisor-v1": false, "character-presence-v1": false, "navigation-refusal-reasons-v1": false, "transition-press-result-v1": false, "stall-briefing-v1": false, "battle-details-v2": false, "dialogue-auto-advance-v1": false, "connection-edge-tiles-v1": false } });
  });
});

describe("operator control requests", () => {
  it("appends numbered requests only while the run's own game server is up, however long its log has been silent", async () => {
    const runsRoot = root();
    liveRun(runsRoot, "live-run");
    liveRun(runsRoot, "paused-run", false, 9003, "paused");
    liveRun(runsRoot, "ended-run", true);
    liveRun(runsRoot, "dead-run", false, 9002);
    expect(await liveRuns(runsRoot, healthy)).toEqual(["paused-run", "live-run"]);
    expect(await appendControl(runsRoot, "live-run", "pause", NOW, healthy)).toBe(1);
    expect(await appendControl(runsRoot, "live-run", "resume", NOW, healthy)).toBe(2);
    expect(await appendControl(runsRoot, "paused-run", "resume", NOW, healthy)).toBe(1);
    expect(readFileSync(join(runsRoot, "live-run", "control.jsonl"), "utf8")).toBe('{"v":1,"seq":1,"at":"2026-10-13T16:00:00.000Z","action":"pause"}\n{"v":1,"seq":2,"at":"2026-10-13T16:00:00.000Z","action":"resume"}\n');
    for (const id of ["ended-run", "dead-run", "missing", "../escape"]) await expect(appendControl(runsRoot, id, "stop", NOW, healthy)).rejects.toThrow(/not live/);
    mkdirSync(join(runsRoot, "unreadable"));
    writeFileSync(join(runsRoot, "unreadable", "events.jsonl"), "");
    expect(await liveRuns(runsRoot, () => Promise.reject(new Error("probe failed")))).toEqual([]);
  });

  it("asks the run's game server for /health on loopback", async () => {
    const seen: string[] = [];
    const probe = healthProbe((input) => { seen.push(typeof input === "string" ? input : ""); return Promise.resolve(new Response("{}", { status: seen.length === 1 ? 200 : 503 })); });
    expect([await probe(9001), await probe(9002)]).toEqual([true, false]);
    expect(seen).toEqual(["http://127.0.0.1:9001/health", "http://127.0.0.1:9002/health"]);
    expect(await healthProbe(() => Promise.reject(new Error("refused")))(9003)).toBe(false);
  });
});

function host(runsRoot: string, endpointFile: string | null = "/tmp/endpoint.json") {
  const launches: LaunchSpec[] = [];
  let finish: (code: number | null) => void = () => undefined;
  const h: QueueHost = { runsRoot, liveJs: "/repo/packages/agent/dist/live.js", endpointFile, gamePort: 8076, healthy, now: () => NOW, random: () => "ab12",
    launch: (spec) => {
      launches.push(spec);
      expect(existsSync(join(runsRoot, LEASE, "owner.json"))).toBe(true);
      spec.started?.(777);
      expect(JSON.parse(readFileSync(join(runsRoot, LEASE, "owner.json"), "utf8"))).toMatchObject({ owner: "viewer-queue", run: spec.runId, child: 777 });
      return new Promise((resolve) => { finish = resolve; });
    } };
  return { h, launches, finish: (code: number | null) => { finish(code); } };
}

describe("run queue", () => {
  it("waits for the live run and the lease, then launches under the lease and releases it", async () => {
    const runsRoot = root();
    liveRun(runsRoot, "live-run");
    const { h, launches, finish } = host(runsRoot);
    const queue = new RunQueue(h);
    expect(queue.enqueue(draft)).toEqual({ state: "queued", runId: "2026-10-13T12-00-00_Qwen3.8-Flash_ab12", waitingFor: "checking" });
    await queue.tick();
    expect(queue.status()).toMatchObject({ state: "queued", waitingFor: "live run live-run" });
    liveRun(runsRoot, "live-run", true);
    mkdirSync(join(runsRoot, LEASE));
    await queue.tick();
    expect(queue.status()).toMatchObject({ state: "queued", waitingFor: "the gameplay lease (a benchmark cohort is running)" });
    expect(() => queue.enqueue(draft)).toThrow(/already queued; cancel it first/);
    const { rmSync } = await import("node:fs"); rmSync(join(runsRoot, LEASE), { recursive: true });
    const running = queue.tick();
    await vi.waitFor(() => { expect(queue.status()).toEqual({ state: "running", runId: "2026-10-13T12-00-00_Qwen3.8-Flash_ab12" }); });
    expect(() => queue.enqueue(draft)).toThrow(/already launching or running/);
    expect(launches).toHaveLength(1);
    const [spec] = launches;
    expect(spec?.argv).toEqual(["/repo/packages/agent/dist/live.js", "play"]);
    expect(spec?.env).toEqual({ POKEBENCH_PLAY_PRESET: join(runsRoot, ".viewer", "presets", "2026-10-13T12-00-00_Qwen3.8-Flash_ab12.json"), POKEBENCH_RUN_ID: "2026-10-13T12-00-00_Qwen3.8-Flash_ab12", POKEBENCH_MODEL: "Qwen3.8-Flash", POKEBENCH_ENDPOINT_FILE: "/tmp/endpoint.json", POKEBENCH_GAME_SERVER_URL: "http://127.0.0.1:8076" });
    expect(JSON.parse(readFileSync(spec?.env["POKEBENCH_PLAY_PRESET"] ?? "", "utf8"))).toMatchObject({ version: 2, features: { ...ALL_ON, "state-only-decisions-v1": false, "named-interactions-v1": false, "world-destinations-v1": false, "bounded-navigation-v1": false, "full-map-navigation-v1": false, "grass-cost-navigation-v1": false, "game-evidence-priority-v1": false, "dialogue-log-v1": false, "loop-guard-supervisor-v1": false, "instruction-ledger-v1": false, "next-milestone-hint-v1": false, "double-context-window-v1": false, "fresh-retry-v1": false, "named-warp-destinations-v1": false, "milestone-stall-stop-v1": false, "text-only-supervisor-v1": false, "character-presence-v1": false, "navigation-refusal-reasons-v1": false, "transition-press-result-v1": false, "stall-briefing-v1": false, "battle-details-v2": false, "dialogue-auto-advance-v1": false, "connection-edge-tiles-v1": false } });
    finish(0);
    await running;
    expect(queue.status()).toEqual({ state: "idle" });
    expect(existsSync(join(runsRoot, LEASE))).toBe(false);
  });

  it("launches past a lease a dead viewer left once its run has ended, but never past a live owner", async () => {
    const runsRoot = root();
    mkdirSync(join(runsRoot, LEASE));
    writeFileSync(join(runsRoot, LEASE, "owner.json"), JSON.stringify({ pid: 300, owner: "viewer-queue", run: "older", child: 301 }));
    const { h, launches, finish } = host(runsRoot);
    let living = new Set([300]);
    const queue = new RunQueue({ ...h, alive: (pid) => living.has(pid) });
    queue.enqueue(draft);
    await queue.tick();
    expect(queue.status()).toMatchObject({ state: "queued", waitingFor: "the gameplay lease (a benchmark cohort is running)" });
    living = new Set([301]);
    await queue.tick();
    expect(queue.status()).toMatchObject({ state: "queued", waitingFor: "the gameplay lease (a benchmark cohort is running)" });
    living = new Set();
    const running = queue.tick();
    await vi.waitFor(() => { expect(launches).toHaveLength(1); });
    finish(0);
    await running;
    expect(queue.status()).toEqual({ state: "idle" });
  });

  it("keeps waiting on an experiment lease a dead viewer left while its trial still plays", async () => {
    const runsRoot = root();
    mkdirSync(join(runsRoot, LEASE));
    writeFileSync(join(runsRoot, LEASE, "owner.json"), JSON.stringify({ pid: 300, owner: "experiment-queue", experiment: "full-map", run: "t0", child: 200 }));
    const { h, launches } = host(runsRoot);
    const queue = new RunQueue({ ...h, healthy: () => Promise.resolve(false), alive: (pid) => pid === 200 });
    queue.enqueue(draft);
    await queue.tick();
    expect(queue.status()).toMatchObject({ state: "queued", waitingFor: "the gameplay lease (a benchmark cohort is running)" });
    expect(launches).toEqual([]);
  });

  it("reports a failed launch and still releases the lease", async () => {
    const runsRoot = root();
    const { h, finish, launches } = host(runsRoot);
    const queue = new RunQueue(h);
    queue.enqueue(draft);
    const running = queue.tick();
    await vi.waitFor(() => { expect(launches).toHaveLength(1); });
    finish(1);
    await running;
    const status = queue.status();
    expect(status.state).toBe("failed");
    expect(status.state === "failed" ? status.error : "").toContain("play exited with code 1");
    expect(existsSync(join(runsRoot, LEASE))).toBe(false);
  });

  it("refuses to queue without a model, an endpoint, or a valid draft, and can cancel", () => {
    const runsRoot = root();
    expect(() => new RunQueue(host(runsRoot, null).h).enqueue(draft)).toThrow(/endpoint file/);
    const queue = new RunQueue(host(runsRoot).h);
    expect(() => queue.enqueue(DEFAULT_NEXT_RUN)).toThrow(/choose a model/);
    expect(() => queue.cancel()).toThrow(/nothing is queued/);
    queue.enqueue(draft);
    expect(queue.cancel()).toEqual({ state: "idle" });
  });

  it("spawns node with an argv list and writes both logs", async () => {
    const dir = root();
    const groups: [number, string][] = [];
    const code = await spawnLaunch({ runId: "x", argv: ["-e", "console.log(process.env.POKEBENCH_RUN_ID); console.error('e'); setTimeout(() => undefined, 500)"], env: { POKEBENCH_RUN_ID: "x" }, stdout: join(dir, "out.log"), stderr: join(dir, "err.log"), started: (pid) => { groups.push([pid, processGroup(pid)]); } });
    expect(code).toBe(0);
    expect(groups.map(([pid, group]) => group === String(pid))).toEqual([true]);
    expect(readFileSync(join(dir, "out.log"), "utf8")).toBe("x\n");
    expect(readFileSync(join(dir, "err.log"), "utf8")).toBe("e\n");
  });
});

describe("run queue edge cases", () => {
  it("records a launch killed by a signal and a launch that throws, releasing the lease each time", async () => {
    for (const outcome of ["signal", "throw"] as const) {
      const runsRoot = root();
      const queue = new RunQueue({ runsRoot, liveJs: "/l.js", endpointFile: "/e.json", gamePort: 8076, healthy, now: () => NOW, random: () => "ee55", launch: () => outcome === "signal" ? Promise.resolve(null) : Promise.reject(new Error("spawn failed")) });
      queue.enqueue(draft);
      await queue.tick();
      const status = queue.status();
      expect(status.state === "failed" ? status.error : "").toContain(outcome === "signal" ? "exited with a signal" : "spawn failed");
      expect(existsSync(join(runsRoot, LEASE))).toBe(false);
      await queue.tick();
      expect(queue.status()).toEqual(status);
    }
  });

  it("does not take over a run id whose preset already exists", async () => {
    const runsRoot = root();
    mkdirSync(join(runsRoot, ".viewer", "presets"), { recursive: true });
    writeFileSync(join(runsRoot, ".viewer", "presets", "2026-10-13T12-00-00_Qwen3.8-Flash_ab12.json"), "{}");
    const { h, launches } = host(runsRoot);
    const queue = new RunQueue(h);
    queue.enqueue(draft);
    await queue.tick();
    expect(queue.status()).toMatchObject({ state: "failed" });
    expect(launches).toEqual([]);
    expect(existsSync(join(runsRoot, LEASE))).toBe(false);
  });
});


describe("queue ticks that overlap", () => {
  function slowHost(runsRoot: string) {
    const probes: ((up: boolean) => void)[] = [];
    const launches: string[] = [];
    const h: QueueHost = { runsRoot, liveJs: "/l.js", endpointFile: "/e.json", gamePort: 8076, now: () => NOW, random: () => "ff00",
      healthy: () => new Promise((resolve) => { probes.push(resolve); }),
      launch: (spec) => { launches.push(spec.runId); return Promise.resolve(0); } };
    return { h, probes, launches };
  }

  it("launches once when a timer tick arrives while the previous one is probing", async () => {
    const runsRoot = root();
    liveRun(runsRoot, "slow-run", false, 9009);
    const { h, probes, launches } = slowHost(runsRoot);
    const queue = new RunQueue(h);
    queue.enqueue(draft);
    const first = queue.tick();
    const second = queue.tick();
    await vi.waitFor(() => { expect(probes).toHaveLength(1); });
    probes[0]?.(false);
    await Promise.all([first, second]);
    expect(launches).toEqual(["2026-10-13T12-00-00_Qwen3.8-Flash_ff00"]);
    expect(queue.status()).toEqual({ state: "idle" });
    expect(existsSync(join(runsRoot, LEASE))).toBe(false);
  });

  it("does nothing when the queued run is cancelled during a probe", async () => {
    const runsRoot = root();
    liveRun(runsRoot, "slow-run", false, 9009);
    const { h, probes, launches } = slowHost(runsRoot);
    const queue = new RunQueue(h);
    queue.enqueue(draft);
    const tick = queue.tick();
    await vi.waitFor(() => { expect(probes).toHaveLength(1); });
    queue.cancel();
    probes[0]?.(true);
    await tick;
    expect(queue.status()).toEqual({ state: "idle" });
    expect(launches).toEqual([]);
  });
});

it("refuses a control request for a run that ended while its server was probed", async () => {
  const runsRoot = root();
  liveRun(runsRoot, "ending", false, 9001);
  const probe = async (port: number): Promise<boolean> => { liveRun(runsRoot, "ending", true, 9001); return healthy(port); };
  await expect(appendControl(runsRoot, "ending", "stop", NOW, probe)).rejects.toThrow(/not live/);
  expect(existsSync(join(runsRoot, "ending", "control.jsonl"))).toBe(false);
});

import { HumanRestarts, type HumanRestartHost } from './next-run.js';
function restartFixture(ended=false,paused=true,probe=false) {
 const r=root(),up=new Set<number>([9001]),launches:LaunchSpec[]=[];let waits=0;let exit:(code:number|null)=>void=()=>undefined;
 const write=(id:string,terminal:boolean,pause:boolean,port=9001)=>{const log=new Log();log.add(0,{...START,controller:{kind:'human',name:'Operator',rom_sha1:'c'.repeat(40),input_policy:'frame-held-v1',sample_ms:100,nominal_fps:59.7275},harness_features:['ram-state-v1',...(probe?['probe']:[])],isolation:{...START.isolation,port}});if(pause)log.add(1,{type:'operator_control',turn:0,action:'pause',status:'applied',request:1,emulator_frozen:true});if(terminal)log.add(2,{type:'run_end',turn:0,reason:'operator_stop',furthest_milestone:null,turns:0,wall_ms:2,tokens:{input:0,output:0},frames:{saved:0,bytes:0}});mkdirSync(join(r,'human',id),{recursive:true});writeFileSync(join(r,'human',id,'events.jsonl'),log.events.map(e=>JSON.stringify({...e,run:id})).join('\n')+'\n');};
 write('old',ended,paused);if(ended)up.clear();
 const h:HumanRestartHost={runsRoot:r,liveJs:'/repo/live.js',now:()=>NOW,random:()=> 'beef',healthy:p=>Promise.resolve(up.has(p)),timeoutMs:200,pollMs:1,wait:()=>{waits++;if(existsSync(join(r,'human','old','control.jsonl'))){write('old',true,paused);up.delete(9001);}return Promise.resolve();},launch:spec=>{launches.push(spec);expect(up.has(9001)).toBe(false);expect(readFileSync(join(r,'human','old','events.jsonl'),'utf8')).toContain('run_end');write(spec.runId,false,true);up.add(9001);return new Promise(resolve=>{exit=resolve;});}};
 return {r,h,write,up,launches,waits:()=>waits,exit:(code:number|null)=> { exit(code); }};
}
it.each([true,false])('restarts an %s paused human only after a durable terminal and port drain',async paused=>{
 const f=restartFixture(false,paused,true),restarts=new HumanRestarts(f.h);const id=await restarts.restart('old');
 expect(f.launches).toHaveLength(1);expect(f.waits()).toBeGreaterThan(0);expect(readFileSync(join(f.r,'human','old','control.jsonl'),'utf8')).toContain('"action":"stop"');
 expect(f.launches[0]).toMatchObject({runId:id,argv:['/repo/live.js','human'],env:{POKEBENCH_HUMAN_RUN_ID:id,POKEBENCH_RUNS_ROOT:f.r,POKEBENCH_HUMAN_START_PAUSED:'true',POKEBENCH_HUMAN_VALIDATION:'true',POKEBENCH_HUMAN_PORT:'9001'}});
 expect(f.launches[0]?.stderr).toContain('/launch-receipts/human-restart/');
 expect(await restarts.restart('old')).toBe(id);expect(await new HumanRestarts(f.h).restart('old')).toBe(id);expect(f.launches).toHaveLength(1);f.exit(0);
});
it('restarts an ended human without another stop and preserves non-probe identity',async()=>{
 const f=restartFixture(true);const id=await new HumanRestarts(f.h).restart('old');expect(existsSync(join(f.r,'human','old','control.jsonl'))).toBe(false);expect(f.launches[0]?.env['POKEBENCH_HUMAN_VALIDATION']).toBe('false');expect(id).not.toBe('old');f.exit(0);
});
it('deduplicates the same source while rejecting different-source concurrent resets',async()=>{
 const f=restartFixture();let release:()=>void=()=>undefined;f.h.wait=()=>new Promise(resolve=>{release=()=>{f.write('old',true,true);f.up.clear();resolve();};});
 const restarts=new HumanRestarts(f.h);const a=restarts.restart('old'),b=restarts.restart('old');await expect(restarts.restart('another')).rejects.toThrow(/busy/);await vi.waitFor(()=> { expect(existsSync(join(f.r,'human','old','control.jsonl'))).toBe(true); });release();expect(await a).toBe(await b);expect(f.launches).toHaveLength(1);f.exit(0);
});
it('rejects model, nonboot, other live human sessions, and old stop timeout without launching',async()=>{
 const model=restartFixture(true);liveRun(model.r,'model');await expect(new HumanRestarts(model.h).restart('model')).rejects.toThrow(/human/);expect(existsSync(join(model.r,'model','control.jsonl'))).toBe(false);
 const saved=restartFixture(true);const path=join(saved.r,'human','old','events.jsonl');writeFileSync(path,readFileSync(path,'utf8').replace('"kind":"boot"','"kind":"save_state","path":"save","sha1":"'+ 'd'.repeat(40)+'"'));await expect(new HumanRestarts(saved.h).restart('old')).rejects.toThrow(/boot/);
 const other=restartFixture();other.write('other',false,true,9003);other.up.add(9003);await expect(new HumanRestarts(other.h).restart('old')).rejects.toThrow(/other.*human|human.*other/);expect(existsSync(join(other.r,'human','old','control.jsonl'))).toBe(false);
 const stuck=restartFixture();stuck.h.wait=()=>Promise.resolve();await expect(new HumanRestarts(stuck.h).restart('old')).rejects.toThrow(/timeout/);expect(stuck.launches).toHaveLength(0);
});
it.each(['exit','reject','unpaused','crash'] as const)('surfaces new %s failure and retains restart receipt without a repeat launch',async mode=>{
 const f=restartFixture(true);f.h.launch=spec=>{f.launches.push(spec);if(mode==='exit')return Promise.resolve(1);if(mode==='reject')return Promise.reject(new Error('spawn failed'));f.write(spec.runId,mode==='crash',false);f.up.add(9001);return new Promise(()=>undefined);};
 const restarts=new HumanRestarts(f.h);await expect(restarts.restart('old')).rejects.toThrow(/failed|exit|timeout|ended/);expect(f.launches).toHaveLength(1);expect(readFileSync(join(f.r,'.viewer','human-restarts','old.json'),'utf8')).toContain(mode==='unpaused'?'launching':'failed');if(mode==='unpaused'||mode==='crash'){await expect(new HumanRestarts(f.h).restart('old')).rejects.toThrow();expect(f.launches).toHaveLength(1);}
});
it('waits for an ended server to drain and rejects a persisted malformed restart receipt',async()=>{
 const f=restartFixture(true);f.up.add(9001);f.h.wait=()=>{f.up.clear();return Promise.resolve();};await new HumanRestarts(f.h).restart('old');f.exit(0);
 const invalid=restartFixture(true);mkdirSync(join(invalid.r,'.viewer','human-restarts'),{recursive:true});writeFileSync(join(invalid.r,'.viewer','human-restarts','old.json'),'{}');await expect(new HumanRestarts(invalid.h).restart('old')).rejects.toThrow(/receipt/);expect(invalid.launches).toHaveLength(0);
});

it('waits for the canonical human lease and a complete terminal line before launching',async()=>{
 const f=restartFixture(true),lease=join(f.r,'canonical-human-lease');mkdirSync(lease);const path=join(f.r,'human','old','events.jsonl');const complete=readFileSync(path,'utf8');writeFileSync(path,complete.trimEnd());let drained=false;
 const restarts=new HumanRestarts({...f.h,leasePath:lease,wait:()=>{expect(f.launches).toHaveLength(0);writeFileSync(path,complete);rmSync(lease,{recursive:true});drained=true;return Promise.resolve();}});
 await restarts.restart('old');expect(drained).toBe(true);f.exit(0);
});
it.each(['port','model','boot','malformed'] as const)('rejects new %s readiness provenance before reporting success',async mode=>{
 const f=restartFixture(true);f.h.launch=spec=>{f.launches.push(spec);f.write(spec.runId,false,true);f.up.add(9001);const path=join(f.r,'human',spec.runId,'events.jsonl');let text=readFileSync(path,'utf8');if(mode==='port')text=text.replace('"port":9001','"port":9002');if(mode==='model')text=text.replace('"kind":"human"','"kind":"other"');if(mode==='boot')text=text.replace('"kind":"boot"','"kind":"save_state","path":"save","sha1":"'+'d'.repeat(40)+'"');if(mode==='malformed')text+='bad\n';writeFileSync(path,text);return new Promise(()=>undefined);};
 await expect(new HumanRestarts(f.h).restart('old')).rejects.toThrow(/validation/);expect(f.launches).toHaveLength(1);
});

it('allows retry after a failed spawn drains, preserving the previous attempt receipt',async()=>{
 const f=restartFixture(true);f.h.launch=spec=>{f.launches.push(spec);return Promise.reject(Error('spawn failed'));};const restarts=new HumanRestarts(f.h);await expect(restarts.restart('old')).rejects.toThrow(/failed/);
 f.h.launch=spec=>{f.launches.push(spec);f.write(spec.runId,false,true);f.up.add(9001);return new Promise(()=>undefined);};
 const id=await new HumanRestarts(f.h).restart('old');expect(f.launches).toHaveLength(2);expect(id).not.toBe(f.launches[0]?.runId);expect(readFileSync(join(f.r,'.viewer','human-restarts','old.attempt-1.json'),'utf8')).toContain('spawn failed');expect(readFileSync(join(f.r,'.viewer','human-restarts','old.json'),'utf8')).toContain('ready');
});
it('keeps a startup timeout pending and resumes the same target when it becomes paused-ready',async()=>{
 const f=restartFixture(true);let mono=0;f.h.monotonic=()=>mono;f.h.wait=()=>{mono+=10;return Promise.resolve();};f.h.launch=spec=>{f.launches.push(spec);return new Promise(()=>undefined);};
 await expect(new HumanRestarts({...f.h,timeoutMs:20}).restart('old')).rejects.toThrow(/timeout/);const id=f.launches[0]?.runId;if(id===undefined)throw Error('fixture');expect(readFileSync(join(f.r,'.viewer','human-restarts','old.json'),'utf8')).toContain('launching');f.write(id,false,true);f.up.add(9001);
 expect(await new HumanRestarts({...f.h,timeoutMs:20}).restart('old')).toBe(id);expect(f.launches).toHaveLength(1);
});
it('counts health-check latency against one transaction deadline and avoids launching after expiry',async()=>{
 const f=restartFixture(true);let mono=0;f.h.monotonic=()=>mono;f.h.healthy=()=>{mono+=25;return Promise.resolve(false);};
 await expect(new HumanRestarts({...f.h,timeoutMs:20}).restart('old')).rejects.toThrow(/timeout/);expect(f.launches).toHaveLength(0);
});

it('persists a late child exit after startup timeout and permits retry only once its server and lease drain',async()=>{
 const f=restartFixture(true);let mono=0,finish:(code:number)=>void=()=>undefined;f.h.monotonic=()=>mono;f.h.wait=()=>{mono+=10;return Promise.resolve();};f.h.launch=spec=>{f.launches.push(spec);return new Promise(resolve=>{finish=resolve;});};
 await expect(new HumanRestarts({...f.h,timeoutMs:20}).restart('old')).rejects.toThrow(/timeout/);finish(1);await Promise.resolve();expect(readFileSync(join(f.r,'.viewer','human-restarts','old.json'),'utf8')).toContain('failed');
 f.up.add(9001);await expect(new HumanRestarts({...f.h,timeoutMs:20}).restart('old')).rejects.toThrow(/draining/);expect(f.launches).toHaveLength(1);
});

it('preserves an original child failure that arrives during a pending retry and allows a drained fresh attempt',async()=>{
 const f=restartFixture(true);let mono=0,finish:(code:number)=>void=()=>undefined;
 f.h.monotonic=()=>mono;f.h.wait=()=>{mono+=10;return Promise.resolve();};
 f.h.launch=spec=>{f.launches.push(spec);return new Promise(resolve=>{finish=resolve;});};
 await expect(new HumanRestarts({...f.h,timeoutMs:20}).restart('old')).rejects.toThrow(/timeout/);
 const path=join(f.r,'.viewer','human-restarts','old.json');const first=f.launches[0]?.runId;
 f.h.wait=()=>{mono+=10;finish(1);return Promise.resolve();};
 await expect(new HumanRestarts({...f.h,timeoutMs:20}).restart('old')).rejects.toThrow();
 const failed=readFileSync(path,'utf8');expect(failed).toContain('"state":"failed"');expect(failed).toContain('exited 1');expect(failed).toContain(first);
 f.h.launch=spec=>{f.launches.push(spec);f.write(spec.runId,false,true);f.up.add(9001);return new Promise(()=>undefined);};
 const next=await new HumanRestarts({...f.h,timeoutMs:20}).restart('old');expect(next).not.toBe(first);expect(f.launches).toHaveLength(2);
 const archived=readFileSync(join(f.r,'.viewer','human-restarts','old.attempt-1.json'),'utf8');expect(archived).toContain('"state":"failed"');expect(archived).toContain('exited 1');
});
