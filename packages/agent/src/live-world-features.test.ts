import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { parseEvent, type RunEvent } from "./events.js";
import type { RunHost, RunPlan } from "./run.js";

const context = vi.hoisted(() => ({ root: "", memory: true, captureRuntime:false, runtimeModes:[] as string[], interactionWarnings:[] as (string|null)[], pingPong:false, pushBack:false, battleLoop:false, files: new Map<string, string[]>(), resolve: undefined as ((event: RunEvent) => void) | undefined, reject: undefined as ((error: unknown) => void) | undefined }));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return { ...actual,
    mkdirSync: (...args: Parameters<typeof actual.mkdirSync>) => context.memory ? undefined : actual.mkdirSync(...args),
    readdirSync: (...args: Parameters<typeof actual.readdirSync>) => context.memory ? [] : actual.readdirSync(...args),
    appendFileSync: (...args: Parameters<typeof actual.appendFileSync>) => {
      if (!context.memory) { actual.appendFileSync(...args); return; }
      const path = String(args[0]); const chunks = context.files.get(path) ?? []; chunks.push(String(args[1])); context.files.set(path, chunks);
    },
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      if(String(args[0])==="/test-owned/rom-fixture.bin")return Buffer.from("test-owned ROM bytes");
      if (!context.memory) return actual.readFileSync(...args);
      if (args[0] instanceof URL && args[0].pathname.endsWith("/package.json")) {
        return JSON.stringify({ dependencies: { "@mariozechner/pi-agent-core": "fixture-version" } });
      }
      const data = context.files.get(String(args[0]));
      if (data === undefined) throw new Error(`missing test-owned memory file ${String(args[0])}`);
      return data.join("");
    },
  };
});
vi.mock("./config.js", () => ({ loadConfig: () => ({ model: "fixture-vlm", gameServerUrl: "http://127.0.0.1:8123", gatewayUrl: "http://fixture.invalid/v1", visionModels: [], endpointFile: null }) }));
vi.mock("./gateway.js", () => ({
  discoverModels: () => Promise.resolve([]),
  selectModel: () => ({ id: "fixture-vlm", input: ["text", "image"], contextWindow: 1000, maxTokens: 100 }),
}));
vi.mock("node:readline", () => ({ createInterface: () => ({ close: () => undefined, async *[Symbol.asyncIterator]() { yield await Promise.resolve(""); } }) }));
vi.mock("./run.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./run.js")>();
  const { FrameStore } = await import("./frames.js");
  return { ...actual, withRun: async (plan: RunPlan, _host:RunHost, _frames:unknown, body:Parameters<typeof actual.withRun>[3]) => {
    const fake: RunHost = {
      serverHealthy: () => Promise.resolve(false),
      launchServer: (dir) => Promise.resolve({ serverDir: join(dir, "server"), stop: () => Promise.resolve() }),
      harness: () => ({ commit: "1".repeat(40), dirty: false }),
      vendorPin: () => "bbab97ad73e460b7cd7c08527d10ced30cc03fbe",
      milestones: { poll: () => Promise.resolve([]) },
      gameState: { nativeActions:()=>Promise.resolve({frame:0,last_id:0,entries:[]}), battleChoices:()=>Promise.resolve({frame:0,last_id:0,entries:[]}), read: () => Promise.resolve({ screen: "title", started: false, name: null, location: null, map_id: null, position: null, facing: null, in_battle: false, party: [], money: null, badges: [], play_time_s: null }) },
    };
    try {
      const result = await actual.withRun({ ...plan, runsRoot: context.root }, fake, new FrameStore(context.root, 1000, () => undefined), context.captureRuntime ? body : () => Promise.resolve("completed"));
      const events = readFileSync(join(context.root, plan.runId, "events.jsonl"), "utf8").trim().split("\n").map((line) => parseEvent(line));
      const starts = events.filter((event) => event.type === "run_start");
      expect(starts).toHaveLength(1);
      const start = starts[0];
      if (start === undefined) throw new Error("no run_start receipt");
      context.resolve?.(start);
      return result;
    } catch (error) { context.reject?.(error); throw error; }
  } };
});
vi.mock("./harness.js",async(importOriginal)=>{
 const actual=await importOriginal<typeof import("./harness.js")>();
 return {...actual,piLoop:(options:Parameters<typeof actual.piLoop>[0])=>{
  if(!context.captureRuntime)return actual.piLoop(options);
  context.runtimeModes.push(options.loopDetector?.mode??"missing detector");
  const state={screen:"overworld",started:true,name:"RED",location:"TEST",map_id:[0,0] as [number,number],position:{x:1,y:1},facing:"DOWN",field_controls_locked:true,in_battle:false,party:[],money:0,badges:[],play_time_s:0,world_context:{objects:[],triggers:[],dialogue:"Box",message:{phase:"page_wait" as const,cursor:30,ready:true}}};
  if(context.pingPong){
   const animation={field_controls_locked:true,resources:{bag:[],pc_items:[],storage:null,berry_trees:null,planted_berries:null,diagnostics:[],script_pc:0,script_mode:0,script_status:2,selected_tree_id:null,berry_script_owner:null}};
   const room=(map:[number,number],locked:boolean)=>({...state,world_context:{objects:[],triggers:[],dialogue:null},map_id:map,...(locked?animation:{field_controls_locked:false})});
   for(let i=0;i<6;i++){const [from,to]:[[number,number],[number,number]]=i%2===0?[[1,0],[1,1]]:[[1,1],[1,0]];options.loopDetector?.complete({name:"press",args:{buttons:[i%2===0?"UP":"DOWN"]},text:"ok",isError:false,acted:true,beforeState:room(from,false),state:room(to,true)});}
  } else if(context.battleLoop){
   // battle-observation-loop-v1: four observes of a battle waiting for input with nothing changing (sh02 T449-T716).
   const battle={...state,screen:"battle",in_battle:true,field_controls_locked:null,world_context:{objects:[],triggers:[],dialogue:null},battle:{active:true,initialized:true,phase:"resolving",ready:false,main_func:134469657,script_pc:137209795,battle_type:4,turn:3,outcome_code:0,outcome:"ongoing",battlers:null,player_inputs:null,controller_exec_flags:1,signals:[],current_execution:null,diagnostic:null,raw_hex:null}};
   for(let i=0;i<4;i++)options.loopDetector?.complete({name:"observe",args:{},text:"ok",isError:false,state:battle});
  } else if(context.pushBack){
   // pushback-loop-detection-v1: a settled tile, then three calls a script message returns to it (sh02 Route 101).
   const home={...state,world_context:{objects:[],triggers:[],dialogue:null},position:{x:7,y:15},field_controls_locked:false};
   const west={...state,position:{x:6,y:15},resources:{bag:[],pc_items:[],storage:null,berry_trees:null,planted_berries:null,diagnostics:[],script_pc:1,script_mode:2,script_status:0,selected_tree_id:null,berry_script_owner:null}};
   options.loopDetector?.complete({name:"observe",args:{},text:"ok",isError:false,state:home});
   for(let i=0;i<3;i++)options.loopDetector?.complete({name:"press",args:{buttons:["LEFT","LEFT","LEFT","UP","UP","UP"]},text:"ok",isError:false,acted:true,beforeState:west,state:home});
  } else for(let i=0;i<3;i++) options.loopDetector?.complete({name:"press",args:{buttons:["A","A"]},text:"ok",isError:false,state,beforeState:state});
  context.interactionWarnings.push(options.loopDetector?.context() ?? null);
  return {start:()=>{options.governor.abort("completed");return Promise.resolve([]);},resume:()=>Promise.resolve([])};
 }};
});
afterEach(() => { context.captureRuntime=false;context.pingPong=false;context.pushBack=false;context.battleLoop=false;context.runtimeModes=[];context.interactionWarnings=[];vi.unstubAllGlobals();vi.unstubAllEnvs(); vi.restoreAllMocks(); if (!context.memory && context.root !== "") rmSync(context.root, { recursive: true, force: true }); context.files.clear(); });
it.each([["smoke", true], ["play", true], ["probe", true], ["verify-state", true], ["smoke", false]] as const)("%s declares world advantages through publisher (memory=%s)", async (command, memory) => {
  vi.resetModules();
  context.memory = memory; context.files.clear();
  context.root = memory ? `/test-owned/world-features-${command}` : mkdtempSync(join(tmpdir(), "pokebench-world-features-"));
  const receipt = new Promise<RunEvent>((resolve, reject) => { context.resolve = resolve; context.reject = reject; });
  vi.stubGlobal("process", Object.assign(Object.create(process) as NodeJS.Process, { argv: [...process.argv.slice(0, 2), command] }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await import("./live.js");
  const start = await receipt;
  if (start.type !== "run_start") throw new Error("unexpected startup event");
  const declared = start.harness_features.filter((f) => f.startsWith("world-") || f === "live-player-position-v1" || f === "press-result-v1");
  expect(start.harness_features.filter((f) => ["live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "warp-activation-guidance-v1"].includes(f))).toEqual(["live-object-sprites-v1", "coordinate-script-conditions-v1", "active-field-message-buffer-v1", "warp-activation-guidance-v1"]);
  expect(declared).toEqual(["world-targets-v1", "live-player-position-v1", "world-coordinate-grid-v1", "press-result-v1"]);
});

it.each([true,false])("play publishes loop-guard ablation (enabled=%s)",async(enabled)=>{
  vi.resetModules();context.captureRuntime=true;context.runtimeModes=[];context.memory=true;context.files.clear();context.root=`/test-owned/loop-publisher-${String(enabled)}`;
  const receipt=new Promise<RunEvent>((resolve,reject)=>{context.resolve=resolve;context.reject=reject;});
  vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"],env:{...process.env,POKEBENCH_LOOP_GUARD:enabled?"1":"0"}}));
  vi.spyOn(console,"log").mockImplementation(()=>undefined);await import("./live.js");const start=await receipt;
  if(start.type!=="run_start")throw new Error("unexpected startup event");expect(context.runtimeModes).toEqual([enabled?"enforced":"diagnostic"]);expect(start.harness_features.filter(f=>f.startsWith("deterministic-loop-diagnostics")||f.startsWith("deterministic-loop-policy"))).toEqual(["deterministic-loop-diagnostics-v1","deterministic-loop-policy-v1:p6:o3:a3:c3:r2:recovery6"]);expect(start.harness_features.filter(f=>f.startsWith("deterministic-loop-guard"))).toEqual(enabled?["deterministic-loop-guard-v1"]:[]);
});

beforeEach(()=>{vi.stubEnv("POKEBENCH_ROM","/test-owned/rom-fixture.bin");});

it.each([true,false])("play delivers enhanced interaction detection only for its effective flag (%s)",async(enabled)=>{
 vi.resetModules();context.captureRuntime=true;context.runtimeModes=[];context.interactionWarnings=[];context.memory=true;context.files.clear();context.root=`/test-owned/interactions-${String(enabled)}`;
 const {flagFeatures}=await import("./play-preset.js");
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true,"dialogue-safe-batches-v1":true,"interaction-loop-detection-v1":enabled};
 const path="/test-owned/interaction-preset.json";context.files.set(path,[JSON.stringify({version:2,id:"interaction-proof",target:null,limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:100},features})]);
 const receipt=new Promise<RunEvent>((resolve,reject)=>{context.resolve=resolve;context.reject=reject;});
 vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"],env:{...process.env,POKEBENCH_PLAY_PRESET:path}}));
 vi.spyOn(console,"log").mockImplementation(()=>undefined);await import("./live.js");const start=await receipt;
 if(start.type!=="run_start")throw new Error("Missing run_start");expect(start.harness_features.includes("interaction-loop-detection-v1")).toBe(enabled);
 expect(context.interactionWarnings).toHaveLength(1);
 if(enabled)expect(context.interactionWarnings[0]).toContain("Use a single input");else expect(context.interactionWarnings).toEqual([null]);
});

it.each([true,false])("play hands the loop guard transition-loop-detection-v1 from its preset (%s)",async(enabled)=>{
 vi.resetModules();context.captureRuntime=true;context.pingPong=true;context.runtimeModes=[];context.interactionWarnings=[];context.memory=true;context.files.clear();context.root=`/test-owned/transition-loop-${String(enabled)}`;
 const {flagFeatures}=await import("./play-preset.js");
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"transition-loop-detection-v1":enabled};
 const path="/test-owned/transition-preset.json";context.files.set(path,[JSON.stringify({version:2,id:"transition-proof",target:null,limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:100},features})]);
 const receipt=new Promise<RunEvent>((resolve,reject)=>{context.resolve=resolve;context.reject=reject;});
 vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"],env:{...process.env,POKEBENCH_PLAY_PRESET:path}}));
 vi.spyOn(console,"log").mockImplementation(()=>undefined);await import("./live.js");const start=await receipt;
 if(start.type!=="run_start")throw new Error("Missing run_start");expect(start.harness_features.includes("transition-loop-detection-v1")).toBe(enabled);
 expect(context.interactionWarnings).toHaveLength(1);
 if(enabled)expect(context.interactionWarnings[0]).toContain("Moving back and forth between the same maps");else expect(context.interactionWarnings).toEqual([null]);
});

it.each([true,false])("play hands the loop guard pushback-loop-detection-v1 from its preset (%s)",async(enabled)=>{
 vi.resetModules();context.captureRuntime=true;context.pushBack=true;context.runtimeModes=[];context.interactionWarnings=[];context.memory=true;context.files.clear();context.root=`/test-owned/pushback-loop-${String(enabled)}`;
 const {flagFeatures}=await import("./play-preset.js");
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"pushback-loop-detection-v1":enabled};
 const path="/test-owned/pushback-preset.json";context.files.set(path,[JSON.stringify({version:2,id:"pushback-proof",target:null,limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:100},features})]);
 const receipt=new Promise<RunEvent>((resolve,reject)=>{context.resolve=resolve;context.reject=reject;});
 vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"],env:{...process.env,POKEBENCH_PLAY_PRESET:path}}));
 vi.spyOn(console,"log").mockImplementation(()=>undefined);await import("./live.js");const start=await receipt;
 if(start.type!=="run_start")throw new Error("Missing run_start");expect(start.harness_features.includes("pushback-loop-detection-v1")).toBe(enabled);
 expect(context.interactionWarnings).toHaveLength(1);
 if(enabled)expect(context.interactionWarnings[0]).toContain("A game script keeps returning the player");else expect(context.interactionWarnings).toEqual([null]);
});

it.each([true,false])("play hands the loop guard battle-observation-loop-v1 from its preset (%s)",async(enabled)=>{
 vi.resetModules();context.captureRuntime=true;context.battleLoop=true;context.runtimeModes=[];context.interactionWarnings=[];context.memory=true;context.files.clear();context.root=`/test-owned/battle-loop-${String(enabled)}`;
 const {flagFeatures}=await import("./play-preset.js");
 const features={...flagFeatures({loopGuard:true,activeUi:true,interfaceDocs:true,objectives:false}),"battle-observation-loop-v1":enabled};
 const path="/test-owned/battle-loop-preset.json";context.files.set(path,[JSON.stringify({version:2,id:"battle-loop-proof",target:null,limits:{maxTurns:2,maxWallMs:10000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:100},features})]);
 const receipt=new Promise<RunEvent>((resolve,reject)=>{context.resolve=resolve;context.reject=reject;});
 vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"],env:{...process.env,POKEBENCH_PLAY_PRESET:path}}));
 vi.spyOn(console,"log").mockImplementation(()=>undefined);await import("./live.js");const start=await receipt;
 if(start.type!=="run_start")throw new Error("Missing run_start");expect(start.harness_features.includes("battle-observation-loop-v1")).toBe(enabled);
 expect(context.interactionWarnings).toHaveLength(1);
 if(enabled)expect(context.interactionWarnings[0]).toContain("Repeated observations contain no new reliable game information");else expect(context.interactionWarnings).toEqual([null]);
});
