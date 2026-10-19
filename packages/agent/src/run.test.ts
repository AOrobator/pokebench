import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent, type RunEvent } from "./events.js";
import { FrameStore } from "./frames.js";
import { harnessInfo, newRunId, withRun, type RunHost, type RunPlan } from "./run.js";

function plan(runsRoot: string, runId = "2026-10-11T22-00-00_think-swarm_aaaa"): RunPlan {
  return {
    runsRoot,
    runId,
    port: 8123,
    model: { id: "think-swarm", context_window: 65536, max_tokens: 16384, vision: true },
    sampling: { thinking_level: "medium", max_tokens: 16384 },
    systemPrompt: "Play.",
    tools: ["screenshot"],
    startState: { kind: "boot" },
    harnessFeatures: [],
    budgets: { max_turns: 5 },
    piVersion: "0.73.1",
  };
}

interface FakeHost extends RunHost {
  readonly calls: string[];
}

function host(options: { staleServer?: boolean; launchFails?: boolean } = {}): FakeHost {
  const calls: string[] = [];
  return {
    calls,
    serverHealthy: (url) => {
      calls.push(`healthy? ${url}`);
      return Promise.resolve(options.staleServer === true);
    },
    launchServer: (runDir, runId, port) => {
      calls.push(`launch ${runId} ${String(port)} ${runDir}`);
      if (options.launchFails === true) return Promise.reject(new Error("boom"));
      return Promise.resolve({
        serverDir: join(runDir, "server"),
        stop: () => {
          calls.push("stop");
          return Promise.resolve();
        },
      });
    },
    harness: () => ({ commit: "0123456789abcdef0123456789abcdef01234567", dirty: true }),
    vendorPin: () => "bbab97ad73e460b7cd7c08527d10ced30cc03fbe",
    milestones: { poll: () => Promise.resolve([]) },
    gameState: {
      read: () =>
        Promise.resolve({
          screen: "title",
          started: false,
          name: null,
          location: null,
          map_id: null,
          position: null,
          facing: null,
          in_battle: false,
          party: [],
          money: null,
          badges: [],
          play_time_s: null,
        }),
    },
  };
}

function events(runsRoot: string, runId: string): RunEvent[] {
  return readFileSync(join(runsRoot, runId, "events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => parseEvent(line));
}

function root(): string {
  return mkdtempSync(join(tmpdir(), "pokebench-run-"));
}

describe("newRunId", () => {
  it("is Eastern time, the model and a random suffix", () => {
    expect(newRunId(new Date("2026-10-12T01:40:05Z"), "think-swarm", () => "a1b2")).toBe(
      "2026-10-11T21-40-05_think-swarm_a1b2",
    );
  });

  it("makes an unusual model id path-safe", () => {
    expect(newRunId(new Date("2026-10-12T01:40:05Z"), "org/Qwen 3:35b", () => "zz")).toBe(
      "2026-10-11T21-40-05_org-Qwen-3-35b_zz",
    );
  });
});

describe("harnessInfo", () => {
  it("reads the commit and dirty state with argv-only git calls", () => {
    const seen: string[][] = [];
    const info = harnessInfo((args) => {
      seen.push(args);
      return args[0] === "rev-parse" ? "0123456789abcdef0123456789abcdef01234567\n" : " M file.ts\n";
    });
    expect(info).toEqual({ commit: "0123456789abcdef0123456789abcdef01234567", dirty: true });
    expect(seen).toEqual([["rev-parse", "HEAD"], ["status", "--porcelain"]]);
  });

  it("is clean when status prints nothing", () => {
    expect(harnessInfo((args) => (args[0] === "rev-parse" ? "a".repeat(40) : "")).dirty).toBe(false);
  });
});

describe("withRun", () => {
  it("launches an isolated server, records run_start, runs the body and always ends", async () => {
    const runsRoot = root();
    const fake = host();
    const frames = new FrameStore(runsRoot, 1000, () => undefined);
    const reason = await withRun(plan(runsRoot), fake, frames, async (recorder) => {
      recorder.retry("probe", 1, 1);
      return Promise.resolve("budget");
    });
    expect(reason).toBe("budget");
    const runDir = join(runsRoot, "2026-10-11T22-00-00_think-swarm_aaaa");
    expect(fake.calls).toEqual([
      "healthy? http://127.0.0.1:8123",
      `launch 2026-10-11T22-00-00_think-swarm_aaaa 8123 ${runDir}`,
      "stop",
    ]);
    const log = events(runsRoot, "2026-10-11T22-00-00_think-swarm_aaaa");
    expect(log[0]).toMatchObject({
      type: "run_start",
      harness: { dirty: true },
      vendor_pin: "bbab97ad73e460b7cd7c08527d10ced30cc03fbe",
      isolation: {
        server_dir: join(runDir, "server"),
        run_data_id: "2026-10-11T22-00-00_think-swarm_aaaa",
        load_checkpoint_mode: false,
        port: 8123,
      },
    });
    expect(log.at(-1)).toMatchObject({ type: "run_end", reason: "budget" });
  });

  it("ends a crashed run with reason crash, stops the server and rethrows", async () => {
    const runsRoot = root();
    const fake = host();
    await expect(
      withRun(plan(runsRoot), fake, new FrameStore(runsRoot, 1000, () => undefined), () =>
        Promise.reject(new Error("model went sideways")),
      ),
    ).rejects.toThrow("model went sideways");
    expect(fake.calls.at(-1)).toBe("stop");
    expect(events(runsRoot, "2026-10-11T22-00-00_think-swarm_aaaa").at(-1)).toMatchObject({
      type: "run_end",
      reason: "crash",
    });
  });

  it("refuses to reuse a server that is already running (INV-7)", async () => {
    const runsRoot = root();
    const fake = host({ staleServer: true });
    await expect(
      withRun(plan(runsRoot), fake, new FrameStore(runsRoot, 1000, () => undefined), () => Promise.resolve("budget")),
    ).rejects.toThrow(/already running/);
    expect(existsSync(join(runsRoot, "2026-10-11T22-00-00_think-swarm_aaaa"))).toBe(false);
  });

  it("refuses to start above 75% frame usage", async () => {
    const runsRoot = root();
    mkdirSync(join(runsRoot, "old", "frames"), { recursive: true });
    writeFileSync(join(runsRoot, "old", "frames", "000001_0.png"), Buffer.alloc(800));
    const fake = host();
    await expect(
      withRun(plan(runsRoot), fake, new FrameStore(runsRoot, 1000, () => undefined), () => Promise.resolve("budget")),
    ).rejects.toThrow(/75%/);
    expect(fake.calls).toEqual([]);
  });

  it("records a crash when the server fails to launch", async () => {
    const runsRoot = root();
    await expect(
      withRun(plan(runsRoot), host({ launchFails: true }), new FrameStore(runsRoot, 1000, () => undefined), () =>
        Promise.resolve("budget"),
      ),
    ).rejects.toThrow("boom");
    expect(existsSync(join(runsRoot, "2026-10-11T22-00-00_think-swarm_aaaa", "events.jsonl"))).toBe(false);
  });
});

describe("withRun when run_start cannot be written", () => {
  it("surfaces the original error and still stops the server", async () => {
    const runsRoot = root();
    const fake = host();
    const failing: RunHost = { ...fake, milestones: { poll: () => Promise.reject(new Error("milestones down")) } };
    await expect(
      withRun(plan(runsRoot), failing, new FrameStore(runsRoot, 1000, () => undefined), () => Promise.resolve("budget")),
    ).rejects.toThrow("milestones down");
    expect(fake.calls.at(-1)).toBe("stop");
  });
});

describe("withRun ownership and metadata", () => {
  it("hands the body the URL of the server it launched, and nothing else", async () => {
    const runsRoot = root();
    const seen: string[] = [];
    await withRun(plan(runsRoot), host(), new FrameStore(runsRoot, 1000, () => undefined), (_recorder, gameServerUrl) => {
      seen.push(gameServerUrl);
      return Promise.resolve("budget");
    });
    expect(seen).toEqual(["http://127.0.0.1:8123"]);
  });

  it("reads harness metadata before launching, so a failure launches nothing", async () => {
    const runsRoot = root();
    const fake = host();
    const broken: RunHost = {
      ...fake,
      vendorPin: () => {
        throw new Error("vendor checkout missing");
      },
    };
    await expect(
      withRun(plan(runsRoot), broken, new FrameStore(runsRoot, 1000, () => undefined), () => Promise.resolve("budget")),
    ).rejects.toThrow("vendor checkout missing");
    expect(fake.calls.filter((call) => call.startsWith("launch"))).toEqual([]);
    expect(existsSync(join(runsRoot, "2026-10-11T22-00-00_think-swarm_aaaa"))).toBe(false);
  });
});

it("captures a script's final milestone after the last tool and before server teardown", async () => {
  const {StateMilestones} = await import("./milestones.js");
  const r = root();
  const base = {screen:"overworld",started:true,name:"A",location:"LITTLEROOT TOWN BRENDANS HOUSE 2F",map_id:[1,1] as [number,number],position:{x:5,y:2},facing:"up",in_battle:false,party:[],money:3000,badges:[],play_time_s:1};
  const story = {name_confirmed:true,intro_stage:5,rival_stage:0,birch_lab_stage:0,petalburg_gym_stage:0,woods_stage:0,clock_set:false,rival_battle_won:false,pokedex_received:false,running_shoes_received:false,starter_tutorial_complete:false,rustboro_gym_complete:false,stone_badge:false,rock_tomb_received:false};
  let complete = false;
  let reads = 0;
  const source = {read:()=>{ reads++;return Promise.resolve({...base,story:{...story,intro_stage:complete?6:5,clock_set:complete}}); }};
  const h = host();
  const owned = {...h,milestones:new StateMilestones(source,()=>1000),gameState:source};
  await withRun({...plan(r),harnessFeatures:["story-state-v1","story-milestones-v2"]},owned,new FrameStore(r),()=>{ complete=true;return Promise.resolve("budget"); });
  const logged=events(r,plan(r).runId);
  const clock=logged.filter((e)=>e.type==="milestone" && e.name==="CLOCK_SET");
  expect(clock).toHaveLength(1);
  expect(clock[0]).toMatchObject({kind:"story",origin:"observed"});
  const ending=logged.at(-1);
  expect(ending).toMatchObject({type:"run_end",furthest_milestone:"CLOCK_SET"});
  expect(reads).toBe(2);
  expect(h.calls.at(-1)).toBe("stop");
});
it("runs registered pre-end work after the final snapshot and records a checkpoint failure before the unchanged terminal reason",async()=>{
 const r=root();let complete=false;
 const h=host(),source={...h.gameState,read:async()=>({...await h.gameState.read(),screen:"overworld",started:true,location:"PETALBURG WOODS",play_time_s:1})};
 await withRun(plan(r),{...h,gameState:source},new FrameStore(r),(_recorder,_url,_start,lifecycle)=>{complete=true;lifecycle.beforeRunEnd(()=>{expect(complete).toBe(true);_recorder.checkpointFailure(new Error("checkpoint disk full"));return Promise.resolve();});return Promise.resolve("budget");});
 const logged=events(r,plan(r).runId);expect(logged.at(-2)).toMatchObject({type:"telemetry_error",source:"checkpoint",message:"checkpoint disk full"});expect(logged.at(-1)).toMatchObject({type:"run_end",reason:"budget"});expect(h.calls.at(-1)).toBe("stop");
});
it('resolves nested human records while rejecting duplicate ownership and traversal',async()=>{
 const {locateRunDir}=await import('./run.js');const r=root();mkdirSync(join(r,'human','human-id'),{recursive:true});expect(locateRunDir(r,'human-id')).toBe(join(r,'human','human-id'));expect(()=>locateRunDir(r,'../escape')).toThrow('not a run id');mkdirSync(join(r,'human-id'));expect(()=>locateRunDir(r,'human-id')).toThrow('ambiguous');
});

it('derives the canonical human lease from Git common-dir for primary and linked checkouts',async()=>{
 const {humanLeasePath,HUMAN_GAMEPLAY_LEASE_NAME}=await import('./run.js');
 expect(HUMAN_GAMEPLAY_LEASE_NAME).toBe('.human-gameplay.lock');
 expect(humanLeasePath('/test-owned/repo','.git')).toBe('/test-owned/repo/runs/.human-gameplay.lock');
 expect(humanLeasePath('/test-owned/worktree','/test-owned/repo/.git')).toBe('/test-owned/repo/runs/.human-gameplay.lock');
 expect(humanLeasePath('/test-owned/worktree','../repo/.git')).toBe('/test-owned/repo/runs/.human-gameplay.lock');
});

it('retains crash terminal and stops server when final battle drain fails',async()=>{
 const r=root(),h=host();let polls=0,taskRan=false;
 const failed={...h,gameState:{...h.gameState,battleChoices:()=>{if(polls++===0)return Promise.resolve({frame:0,last_id:0,entries:[]});return Promise.reject(Error("journal full"));}}};
 await expect(withRun({...plan(r),harnessFeatures:["battle-choices-v1"]},failed,new FrameStore(r),(_recorder,_url,_start,lifecycle)=>{lifecycle.beforeRunEnd(()=>{taskRan=true;return Promise.resolve();});return Promise.resolve("completed");})).rejects.toThrow("journal full");
 expect(taskRan).toBe(true);expect(events(r,plan(r).runId).at(-1)).toMatchObject({type:"run_end",reason:"crash"});expect(h.calls.at(-1)).toBe("stop");
});
