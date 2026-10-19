import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { PiLoopOptions } from "./harness.js";
import type { RunHost, RunPlan } from "./run.js";
import type { RunRecorder } from "./recorder.js";
import { parseEvent, type RunEvent } from "./events.js";
import {NAME_CONFIRMED} from "../test-support/events.js";
import {assistant} from "../test-support/pi.js";
import { OBJECTIVE_PROMPT } from "./objective-tools.js";

const owner = vi.hoisted(() => ({ files: new Map<string, string[]>(), loop: null as PiLoopOptions | null, start: null as Extract<RunEvent, { type: "run_start" }> | null, context: "", screen:"title", seedInitial:false,stateReads:0, duringPlay: null as ((loop:PiLoopOptions)=>Promise<void>)|null, clock:null as (()=>number)|null, resolve: undefined as ((plan: RunPlan) => void) | undefined, reject: undefined as ((error: unknown) => void) | undefined }));
vi.mock("node:fs", async (load) => {
  const actual = await load<typeof import("node:fs")>();
  return { ...actual, mkdirSync: () => undefined, readdirSync: () => [],
    writeFileSync: (path: Parameters<typeof actual.writeFileSync>[0], data: Parameters<typeof actual.writeFileSync>[1]) => { owner.files.set(String(path),[typeof data==="string"?data:"test-owned binary frame"]); },
    appendFileSync: (path: Parameters<typeof actual.appendFileSync>[0], data: Parameters<typeof actual.appendFileSync>[1]) => {
      const key = String(path);const chunks = owner.files.get(key) ?? [];chunks.push(String(data));owner.files.set(key, chunks);
    },
    readFileSync: (path: Parameters<typeof actual.readFileSync>[0]) => {
      if(String(path)==="/test-owned/rom-fixture.bin")return Buffer.from("test-owned ROM bytes");
      if (path instanceof URL && path.pathname.endsWith("/package.json")) return JSON.stringify({ dependencies: { "@mariozechner/pi-agent-core": "fixture-version" } });
      const chunks = owner.files.get(String(path));if (!chunks) throw Object.assign(new Error(`unknown test-owned file ${String(path)}`), { code: "ENOENT" });return chunks.join("");
    },
  };
});
vi.mock("./recorder.js",async(load)=>{const actual=await load<typeof import("./recorder.js")>();return {...actual,RunRecorder:class extends actual.RunRecorder {override elapsedMs():number{return owner.clock?.()??super.elapsedMs();}}};});
vi.mock("./config.js", () => ({ loadConfig: () => ({ model: "fixture-vlm", gameServerUrl: "http://127.0.0.1:8123", gatewayUrl: "http://fixture.invalid/v1", visionModels: [], endpointFile: null }) }));
vi.mock("./gateway.js", () => ({ discoverModels: () => Promise.resolve([]), selectModel: () => ({ id: "fixture-vlm", input: ["text", "image"], contextWindow: 1000, maxTokens: 100 }) }));
vi.mock("./harness.js", async (load) => {
  const actual = await load<typeof import("./harness.js")>();
  return { ...actual, piLoop: (options: PiLoopOptions) => { owner.loop = options;return { start: () => Promise.resolve(), resume: () => Promise.resolve() }; }, play: async () => { owner.context = JSON.stringify(await owner.loop?.transformContext([] as AgentMessage[]));if(owner.loop!==null)await owner.duringPlay?.(owner.loop);return "completed"; } };
});
vi.mock("./run.js", async (load) => {
  const actual = await load<typeof import("./run.js")>();const { FrameStore } = await import("./frames.js");
  return { ...actual, withRun: async (plan: RunPlan, _host: RunHost, _frames: InstanceType<typeof FrameStore>, body: (recorder: RunRecorder, url: string) => Promise<import("./events.js").RunEndReason>) => {
    const host: RunHost = {
      serverHealthy: () => Promise.resolve(false), launchServer: (dir) => Promise.resolve({ serverDir: `${dir}/server`, stop: () => Promise.resolve() }),
      harness: () => ({ commit: "1".repeat(40), dirty: false }), vendorPin: () => "bbab97ad73e460b7cd7c08527d10ced30cc03fbe",
      milestones: { poll: () => Promise.resolve([]),...(owner.seedInitial?{observe:()=>[]}: {}) },
      gameState: { nativeActions:()=>Promise.resolve({frame:0,last_id:0,entries:[]}), battleChoices:()=>Promise.resolve({frame:0,last_id:0,entries:[]}), read: () => (owner.stateReads++,Promise.resolve({ raw_ram:{v:1 as const,sequence:1,frame:1,path:"raw-ram/00000001.json.gz",sha256:"a".repeat(64)},game_stats:null,blackout_active:null,route103_rival:null,screen: owner.screen, started: false, name: null, location: null, map_id: null, position: null, facing: null, in_battle: false, party: [], money: null, badges: [], play_time_s: null,story:{...NAME_CONFIRMED.story,name_confirmed:false} })) },
    };
    try {
      const root = "/test-owned/objective-entrypoint";
      const result = await actual.withRun({ ...plan, runsRoot: root }, host, new FrameStore(root, 1000, () => undefined), body);
      const events = readFileSync(`${root}/${plan.runId}/events.jsonl`, "utf8").trim().split("\n").map((line) => parseEvent(line));
      const starts = events.filter((event: RunEvent) => event.type === "run_start");
      expect(starts).toHaveLength(1);
      const start = starts[0];
      if (!start) throw new Error("missing recorded run_start in test-owned log");
      expect({ prompt: start.system_prompt, tools: start.tools, features: start.harness_features }).toEqual({ prompt: plan.systemPrompt, tools: plan.tools, features: plan.harnessFeatures });
      expect(start.rom_sha1).toBe(createHash("sha1").update("test-owned ROM bytes").digest("hex"));
      owner.start = start;
      expect(events.filter((event: RunEvent) => event.type === "run_end")).toHaveLength(1);
      owner.resolve?.(plan);return result;
    } catch (error) { owner.reject?.(error);throw error; }
  } };
});
function currentLoop(): PiLoopOptions | null { return owner.loop; }
afterEach(() => { vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();owner.files.clear();owner.loop = null;owner.start = null;owner.clock=null;owner.duringPlay=null;owner.screen="title";owner.seedInitial=false;owner.stateReads=0; });
it.each([[undefined, undefined, undefined], [undefined, "0", "0"], ["0", undefined, "1"], ["0", "0", "0"]])("actual play entrypoint agrees on tools, context, prompt and metadata (objectives=%s, interface=%s)", async (flag, interfaceFlag, activeUiFlag) => {
  vi.resetModules();owner.files.clear();owner.loop = null;
  const done = new Promise<RunPlan>((resolve, reject) => { owner.resolve = resolve;owner.reject = reject; });
  vi.stubEnv("POKEBENCH_OBJECTIVES", flag);
  vi.stubEnv("POKEBENCH_INTERFACE_DOCS", interfaceFlag);
  vi.stubEnv("POKEBENCH_ACTIVE_UI", activeUiFlag);
  vi.stubGlobal("process", Object.assign(Object.create(process) as NodeJS.Process, { argv: [...process.argv.slice(0, 2), "play"] }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await import("./live.js");const plan = await done;const loop = currentLoop();
  if (!loop) throw new Error("entrypoint did not create model loop");
  const start = owner.start;
  if (!start) throw new Error("entrypoint did not record run_start");
  const enabled = flag !== "0";
  const tools = ["observe", "press", ...(enabled ? ["get_objectives", "set_objective", "update_objective"] : [])];
  expect(loop.tools.map((tool) => tool.name)).toEqual(tools);expect(plan.tools).toEqual(tools);
  expect(plan.systemPrompt.includes("Model memory is a hypothesis")).toBe(enabled);
  expect(plan.harnessFeatures.includes("objective-tracking-v1")).toBe(enabled);
  expect(plan.harnessFeatures.includes("repeat-attempt-guard-v1")).toBe(enabled);
  expect(loop.systemPrompt).toBe(start.system_prompt);
  expect(loop.tools.map((tool) => tool.name)).toEqual(start.tools);
  expect(owner.context.includes("HARNESS OBJECTIVE RECORD")).toBe(enabled);
  const documented = interfaceFlag !== "0";
  expect(start.harness_features.includes("contextual-interface-docs-v1")).toBe(documented);
  expect(start.harness_features.includes("new-game-created-v1")).toBe(true);
  expect(start.harness_features.includes("native-objective-completion-v1")).toBe(enabled);
  expect(start.harness_features.includes("active-ui-ownership-v1")).toBe(activeUiFlag !== "0");
  expect(loop.systemPrompt.includes("Buttons are contextual")).toBe(documented);
  expect(loop.systemPrompt.includes("not phone-style cycling groups")).toBe(documented);
  expect(loop.systemPrompt.includes("START moves the cursor to OK")).toBe(documented);
  expect(loop.systemPrompt.includes("editor text is not a confirmed trainer name")).toBe(documented);
  if (!documented) {
    const prompt = enabled ? start.system_prompt.slice(0, -(OBJECTIVE_PROMPT.length + 2)) : start.system_prompt;
    expect(createHash("sha256").update(prompt).digest("hex")).toBe("39af4e89110a2513733b420995fcff01c93b17f3e34dcffa11a7cbcc2f32d7e8");
  }
});


it.each([undefined,"0","1"])("actual probe producer declares active UI exposure for %s", async (flag) => {
  vi.resetModules();owner.files.clear();
  const done=new Promise<RunPlan>((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
  vi.stubEnv("POKEBENCH_ACTIVE_UI",flag);
  vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"probe"]}));
  vi.spyOn(console,"log").mockImplementation(()=>undefined);
  vi.doMock("./probe.js",()=>({driveProbe:()=>Promise.resolve("completed"),parseProbeCommand:()=>({action:"end"}),verifyIntro:()=>undefined}));
  await import("./live.js");const plan=await done;
  expect(plan.harnessFeatures.includes("active-ui-ownership-v1")).toBe(flag!=="0");
  expect(owner.start?.harness_features).toEqual(plan.harnessFeatures);
  vi.doUnmock("./probe.js");
});

it.each([0,15000,600000])("actual play honors run-start anchored preset limits, flags, sampling and assigned run id (capture=%s)", async (initialCapture) => {
  vi.resetModules();owner.files.clear();owner.loop=null;
  const preset={version:1,id:"name-control",target:"PLAYER_NAME_CONFIRMED",limits:{maxTurns:300,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:100},flags:{loopGuard:false,activeUi:false,interfaceDocs:true,objectives:true}};
  owner.files.set("/test-owned/preset.json",[JSON.stringify(preset)]);
  vi.stubEnv("POKEBENCH_PLAY_PRESET","/test-owned/preset.json");vi.stubEnv("POKEBENCH_RUN_ID","assigned-name-control");
  vi.stubEnv("POKEBENCH_LOOP_GUARD","1");vi.stubEnv("POKEBENCH_ACTIVE_UI","1");
  const timers=vi.spyOn(globalThis,"setTimeout");
  let now=initialCapture;vi.spyOn(Date,"now").mockImplementation(()=>now);
  owner.clock=()=>now;
  const done=new Promise<RunPlan>((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
  vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"]}));
  vi.spyOn(console,"log").mockImplementation(()=>undefined);
  await import("./live.js");const plan=await done;
  expect(plan.runId).toBe("assigned-name-control");expect(plan.budgets).toEqual({max_turns:300,max_wall_ms:600000});
  expect(plan.sampling).toEqual({thinking_level:"medium",max_tokens:100});
  expect(owner.start).toMatchObject({evaluation:{preset_id:"name-control",target:"PLAYER_NAME_CONFIRMED",failure_limit:3,flags:preset.flags}});
  if(initialCapture>=600000){expect(currentLoop()).toBeNull();expect(timers.mock.calls).toHaveLength(0);const ends=[...owner.files.entries()].filter(([path])=>path.endsWith("/events.jsonl")).flatMap(([,chunks])=>chunks.join("").trim().split("\n").map(parseEvent)).filter(event=>event.type==="run_end");expect(ends).toHaveLength(1);expect(ends[0]).toMatchObject({reason:"budget"});return;}
  expect(timers.mock.calls.map((call)=>call[1])).toContain(600000-initialCapture);
  expect(plan.harnessFeatures).toContain("native-target-stop-v1");expect(currentLoop()?.systemPrompt).toContain("Reach the native game milestone PLAYER NAME CONFIRMED");expect(currentLoop()?.systemPrompt).not.toContain("Your goal is to make as much story progress");expect(plan.harnessFeatures).not.toContain("deterministic-loop-guard-v1");expect(plan.harnessFeatures).not.toContain("active-ui-ownership-v1");
  const loop=currentLoop();if(loop===null)throw new Error("missing actual preset governor");now=600000;const stopped=loop.governor.afterTurn(assistant({toolCalls:[{type:"toolCall",id:"fixture",name:"observe",arguments:{}}]}),[]);expect({stopped,reason:loop.governor.stopReason}).toEqual({stopped:true,reason:"budget"});
});

beforeEach(()=>{vi.stubEnv("POKEBENCH_ROM","/test-owned/rom-fixture.bin");});

it("records a preset's replyFailuresEndRun in run_start", async () => {
  vi.resetModules();owner.files.clear();owner.loop=null;
  const preset={version:1,id:"lenient",target:null,limits:{maxTurns:300,maxWallMs:600000,failureLimit:3,replyFailuresEndRun:false},sampling:{thinkingLevel:"medium",maxTokens:100},flags:{loopGuard:false,activeUi:false,interfaceDocs:true,objectives:true}};
  owner.files.set("/test-owned/preset.json",[JSON.stringify(preset)]);
  vi.stubEnv("POKEBENCH_PLAY_PRESET","/test-owned/preset.json");vi.stubEnv("POKEBENCH_RUN_ID","assigned-lenient");
  vi.spyOn(Date,"now").mockImplementation(()=>0);owner.clock=()=>0;
  const done=new Promise<RunPlan>((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
  vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"]}));
  vi.spyOn(console,"log").mockImplementation(()=>undefined);
  await import("./live.js");await done;
  expect(owner.start).toMatchObject({evaluation:{preset_id:"lenient",failure_limit:3,reply_failures_end_run:false}});
  const recorded=(owner.start as {evaluation?:{features?:Record<string,boolean>}}).evaluation?.features;
  expect(recorded).toMatchObject({"deterministic-loop-guard-v1":false,"milestone-stall-stop-v1":false,"stall-briefing-v1":false});
  expect(Object.values(recorded??{}).every(v=>typeof v==="boolean")).toBe(true);
});

it.each([[false,"clock"],[true,"clock"],[true,"bag_menu"],[true,"party_menu"]] as const)("actual play wires JIT request transformation and execution guard (enabled=%s, screen=%s)",async (enabled,screen)=>{
 vi.resetModules();owner.files.clear();owner.loop=null;
 const {flagFeatures}=await import("./play-preset.js");
 const preset={version:2,id:"jit-factory",target:null,limits:{maxTurns:20000,maxWallMs:600000,failureLimit:3,replyFailuresEndRun:false},sampling:{thinkingLevel:"medium",maxTokens:100},features:{...flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false}),"just-in-time-prompt-v1":enabled,"battle-move-tool-v1":true}};
 owner.files.set("/test-owned/preset.json",[JSON.stringify(preset)]);
 vi.stubEnv("POKEBENCH_PLAY_PRESET","/test-owned/preset.json");vi.stubEnv("POKEBENCH_RUN_ID","assigned-jit-factory");
 vi.spyOn(console,"log").mockImplementation(()=>undefined);
 let blocked:unknown=null;
 owner.screen=screen;
 const scene=screen==="clock"?"clock":"menu";
 owner.duringPlay=async loop=>{
  await loop.emit({type:"tool_execution_start",toolCallId:"observe-jit",toolName:"observe",args:{}});
  await loop.emit({type:"tool_execution_end",toolCallId:"observe-jit",toolName:"observe",isError:false,result:{content:[{type:"text",text:screen}],details:{state:{raw_ram:{v:1,sequence:1,frame:1,path:"raw-ram/00000001.json.gz",sha256:"a".repeat(64)},story:{...NAME_CONFIRMED.story,name_confirmed:false},game_stats:null,blackout_active:null,route103_rival:null,screen,active_ui:{phase:screen,selected:null,ready:true,controls:"",diagnostic:null},started:false,name:null,location:null,map_id:null,position:null,facing:null,in_battle:scene==="menu",party:[],money:null,badges:[],play_time_s:null}}}});
  const request={systemPrompt:"standing",messages:[],tools:[{name:"observe",description:"observe",parameters:{type:"object",properties:{}}},{name:"battle_action",description:"fight",parameters:{type:"object",properties:{}}}]};
  const next=loop.requestContext?.(request);
  expect(next?.tools?.map(t=>t.name)).toEqual(enabled?["observe"]:["observe","battle_action"]);
  const call={type:"toolCall" as const,id:"bad-jit",name:"battle_action",arguments:{}};
  blocked=await loop.base.beforeToolCall?.({assistantMessage:assistant({toolCalls:[call]}),toolCall:call,args:{},context:{systemPrompt:"standing",messages:[],tools:loop.tools}});
  await loop.emit({type:"message_end",message:assistant({text:"sample"})});
 };
 const done=new Promise<RunPlan>((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
 vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"]}));
 await import("./live.js");await done;
 const loop=currentLoop();if(loop===null)throw new Error("missing JIT factory");
 const request={systemPrompt:"standing",messages:[],tools:[{name:"observe",description:"observe",parameters:{type:"object",properties:{}}},{name:"battle_action",description:"fight",parameters:{type:"object",properties:{}}}]};
 const next=loop.requestContext?.(request);
 expect(next===request).toBe(!enabled);
 expect(owner.start?.harness_features.includes("just-in-time-prompt-v1")).toBe(enabled);
 expect(next?.tools?.map(t=>t.name)).toEqual(enabled?["observe"]:["observe","battle_action"]);
 if(enabled)expect(blocked).toMatchObject({block:true});else expect(blocked).toBeUndefined();
 const recorded=[...owner.files.entries()].filter(([path])=>path.endsWith("/events.jsonl")).flatMap(([,chunks])=>chunks.join("").trim().split("\n").map(parseEvent));
 const response=recorded.find(e=>e.type==="assistant");
 if(enabled){
  expect(response).toMatchObject({request_context:{scene,tools:["observe"]}});
  if(response?.type!=="assistant"||response.request_context===undefined)throw new Error("missing JIT receipt");
  expect(response.request_context.prompt_sha256).toBe(createHash("sha256").update(response.request_context.system_prompt).digest("hex"));
  expect(recorded.find(e=>e.seq===response.request_context?.state_seq)).toMatchObject({type:"state",screen});
 }else expect(response).toMatchObject({request_context:{mode:"full",system_prompt:"standing"}});
});

it.each([[true,"clock",true],[false,"clock",true],[true,"title",true],[true,"clock",false]] as const)("first dispatch uses recorded startup state without another read (JIT=%s, screen=%s, initial=%s)",async(enabled,screen,initial)=>{
 vi.resetModules();owner.files.clear();owner.loop=null;owner.screen=screen;owner.seedInitial=initial;owner.stateReads=0;
 const {flagFeatures}=await import("./play-preset.js");
 const preset={version:2,id:"jit-startup",target:null,limits:{maxTurns:20000,maxWallMs:600000,failureLimit:3,replyFailuresEndRun:false},sampling:{thinkingLevel:"medium",maxTokens:100},features:{...flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false}),"just-in-time-prompt-v1":enabled,"battle-move-tool-v1":true}};
 owner.files.set("/test-owned/startup-preset.json",[JSON.stringify(preset)]);
 vi.stubEnv("POKEBENCH_PLAY_PRESET","/test-owned/startup-preset.json");vi.stubEnv("POKEBENCH_RUN_ID","assigned-jit-startup");vi.spyOn(console,"log").mockImplementation(()=>undefined);
 const narrow=enabled&&initial&&screen==="clock";
 owner.duringPlay=async loop=>{
  expect(owner.stateReads).toBe(initial?1:0);
  const request={systemPrompt:"standing",messages:[],tools:[{name:"observe",description:"observe",parameters:{type:"object",properties:{}}},{name:"battle_action",description:"fight",parameters:{type:"object",properties:{}}}]};
  const next=loop.requestContext?.(request);
  expect(next===request).toBe(!enabled);
  expect(next?.tools?.map(t=>t.name)).toEqual(narrow?["observe"]:["observe","battle_action"]);
  if(narrow)expect(next?.systemPrompt).toContain("Clock interface:");
  expect(owner.stateReads).toBe(initial?1:0);
  await loop.emit({type:"message_end",message:assistant({text:"first response before any tool observation"})});
 };
 const done=new Promise<RunPlan>((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
 vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"]}));
 await import("./live.js");await done;
 const recorded=[...owner.files.entries()].filter(([path])=>path.endsWith("/events.jsonl")).flatMap(([,chunks])=>chunks.join("").trim().split("\n").map(parseEvent));
 const response=recorded.find(e=>e.type==="assistant");
 if(response?.type!=="assistant"||response.request_context===undefined)throw Error("missing initial request receipt");
 expect(response.request_context).toMatchObject({mode:enabled?"jit":"full",scene:initial&&screen==="clock"?"clock":"unknown"});
 if(initial){
  const state=recorded.find(e=>e.type==="state");expect(state).toMatchObject({screen});
  expect(response.request_context.state_seq).toBe(state?.seq);expect(state?.seq).toBeLessThan(response.seq);
 }else expect(response.request_context.state_seq).toBeNull();
 expect(recorded.filter(e=>e.type==="tool_call")).toHaveLength(0);
});


it.each([[false,"clock"],[true,"clock"],[false,"main_menu"],[true,"main_menu"]] as const)("actual play routes stable JIT v2 at startup with full tools and no v1 guard (enabled=%s screen=%s)",async (enabled,screen)=>{
 vi.resetModules();owner.files.clear();owner.loop=null;owner.screen=screen;owner.seedInitial=true;owner.stateReads=0;
 const {flagFeatures}=await import("./play-preset.js");
 const preset={version:2,id:"jit-v2-startup",target:null,limits:{maxTurns:20000,maxWallMs:600000,failureLimit:3,replyFailuresEndRun:false},sampling:{thinkingLevel:"medium",maxTokens:100},features:{...flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false}),"just-in-time-prompt-v1":true,"just-in-time-prompt-v2":enabled,"battle-move-tool-v1":true}};
 owner.files.set("/test-owned/v2-preset.json",[JSON.stringify(preset)]);
 vi.stubEnv("POKEBENCH_PLAY_PRESET","/test-owned/v2-preset.json");vi.stubEnv("POKEBENCH_RUN_ID","assigned-jit-v2-startup");vi.spyOn(console,"log").mockImplementation(()=>undefined);
 owner.duringPlay=async loop=>{
  const request={systemPrompt:"standing",messages:[{role:"user" as const,content:"Play",timestamp:1}],tools:[{name:"observe",description:"observe",parameters:{type:"object",properties:{}}},{name:"battle_action",description:"fight",parameters:{type:"object",properties:{}}}]};
  const next=loop.requestContext?.(request);
  expect(next?.tools?.map(t=>t.name)).toEqual(enabled||screen==="main_menu"?["observe","battle_action"]:["observe"]);
  if(enabled){expect(next?.systemPrompt).not.toContain("Clock interface:");if(screen==="clock")expect(next?.messages.at(-1)?.content).toContain("Clock interface:");else expect(next?.messages).toEqual(request.messages);}
  const call={type:"toolCall" as const,id:"v2-battle",name:"battle_action",arguments:{}};
  const blocked=await loop.base.beforeToolCall?.({assistantMessage:assistant({toolCalls:[call]}),toolCall:call,args:{},context:{...request,tools:loop.tools}});
  if(enabled||screen==="main_menu")expect(blocked).toBeUndefined();else expect(blocked).toMatchObject({block:true});
  expect(owner.stateReads).toBe(1);
  await loop.emit({type:"message_end",message:assistant({text:"startup sample"})});
 };
 const done=new Promise<RunPlan>((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
 vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"]}));
 await import("./live.js");await done;
 const recorded=[...owner.files.entries()].filter(([path])=>path.endsWith("/events.jsonl")).flatMap(([,chunks])=>chunks.join("").trim().split("\n").map(parseEvent));
 const response=recorded.find(e=>e.type==="assistant");
 expect(response).toMatchObject({request_context:{mode:enabled?"jit-v2":"jit",scene:screen==="clock"?"clock":"unknown"}});
 if(response?.type!=="assistant"||response.request_context===undefined)throw Error("missing receipt");
 expect(recorded.find(e=>e.seq===response.request_context?.state_seq)).toMatchObject({type:"state",screen});
 if(enabled&&screen==="clock")expect(response.request_context.guidance?.text).toContain("Clock interface:");
 if(enabled&&screen==="main_menu"){expect(response.request_context.guidance).toBeUndefined();expect(response.request_context.projected_guidance).toEqual([]);expect(response.request_context.component_chars?.guidance_text).toBe(0);}
});

it.each([false,true])("actual play delivers and records retained-guide reuse (enabled=%s)",async reuse=>{
 vi.resetModules();owner.files.clear();owner.loop=null;owner.screen="clock";owner.seedInitial=true;
 const {flagFeatures}=await import("./play-preset.js");
 const preset={version:2,id:"reuse-entrypoint",target:null,limits:{maxTurns:20000,maxWallMs:1200000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:100},features:{...flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false}),"just-in-time-prompt-v2":true,"jit-guide-reuse-v1":reuse}};
 owner.files.set("/test-owned/reuse.json",[JSON.stringify(preset)]);vi.stubEnv("POKEBENCH_PLAY_PRESET","/test-owned/reuse.json");vi.stubEnv("POKEBENCH_RUN_ID","assigned-reuse");vi.spyOn(console,"log").mockImplementation(()=>undefined);
 owner.duringPlay=async loop=>{
  const history:import("@mariozechner/pi-ai").Message[]=[{role:"user",content:"Play",timestamp:1}];
  const request=()=>loop.requestContext?.({systemPrompt:"standing",messages:history,tools:[{name:"observe",description:"observe",parameters:{type:"object",properties:{}}}]});
  const first=request();expect(first?.messages.at(-1)?.content).toContain("Clock interface:");
  for(const [n,screen] of ["main_menu","clock"].entries()){
   const id=`reentry-${String(n)}`;
   await loop.emit({type:"tool_execution_start",toolCallId:id,toolName:"observe",args:{}});
   await loop.emit({type:"tool_execution_end",toolCallId:id,toolName:"observe",isError:false,result:{content:[{type:"text",text:screen}],details:{state:{raw_ram:{v:1,sequence:n+2,frame:n+2,path:`raw-ram/0000000${String(n+2)}.json.gz`,sha256:"a".repeat(64)},story:{...NAME_CONFIRMED.story,name_confirmed:false},game_stats:null,blackout_active:null,route103_rival:null,screen,started:false,name:null,location:null,map_id:null,position:null,facing:null,in_battle:false,party:[],money:null,badges:[],play_time_s:null}}}});
   history.push(assistant({toolCalls:[{type:"toolCall",id,name:"observe",arguments:{}}]}),{role:"toolResult",toolCallId:id,toolName:"observe",isError:false,timestamp:n+2,content:[{type:"text",text:screen}]});
   const next=request();if(n===1)expect(next?.messages.filter(m=>m.role==="user"&&typeof m.content==="string"&&m.content.includes("HARNESS INTERFACE GUIDANCE"))).toHaveLength(reuse?1:2);
  }
  await loop.emit({type:"message_end",message:assistant({text:"re-entry sample"})});
 };
 const done=new Promise<RunPlan>((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"]}));await import("./live.js");await done;
 const events=[...owner.files.entries()].filter(([p])=>p.endsWith("/events.jsonl")).flatMap(([,chunks])=>chunks.join("").trim().split("\n").map(parseEvent));
 const response=events.find(e=>e.type==="assistant");expect(response).toMatchObject({request_context:{mode:"jit-v2",scene:"clock",guidance:{reason:reuse?"reused":"scene_change",anchor:reuse?"task":"tool:reentry-1"}}});
 if(response?.type!=="assistant")throw Error("missing recorded assistant");expect(response.request_context?.projected_guidance).toHaveLength(reuse?1:2);
});

it("production play settles battle text before constructing the model request context",async()=>{
 vi.resetModules();owner.files.clear();owner.loop=null;
 const {flagFeatures}=await import("./play-preset.js");
 const actualFs=await vi.importActual<typeof import("node:fs")>("node:fs");
 const {gunzipSync}=await import("node:zlib");
 const {parseGameState}=await import("./game-state.js");
 const recorded=JSON.parse(gunzipSync(actualFs.readFileSync(new URL("./fixtures/battle-text-show-7753.json.gz",import.meta.url))).toString("utf8")) as {frames:{raw_ram:string;state:unknown}[]};
 const waiting=parseGameState(recorded.frames.find(f=>f.raw_ram==="00007772.json.gz")?.state);
 const ready=parseGameState(recorded.frames.find(f=>f.raw_ram==="00007782.json.gz")?.state);
 for(const state of [waiting,ready]){state.raw_ram={v:1,sequence:1,frame:1,path:"raw-ram/00000001.json.gz",sha256:"a".repeat(64)};state.route103_rival=null;}
 let current=waiting;const presses:string[]=[];
 const image=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(image);image.writeUInt32BE(13,8);image.write("IHDR",12);image.writeUInt32BE(240,16);image.writeUInt32BE(160,20);
 vi.stubGlobal("fetch",((input,init)=>{
  const path=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url).pathname;let body:unknown;
  if(path==="/pokebench/state")body=current;
  else if(path==="/pokebench/observation")body={state:current,state_text:`Screen: battle; ${current.battle?.text_phase??"unknown"}`,screenshot_base64:image.toString("base64")};
  else if(path==="/pokebench/battle/messages")body={frame:1,first_id:1,last_id:1,errors:0,last_error:null,entries:[{id:1,frame:1,recorded_ms:0,battle:1,battle_turn:1,text:"Wild WURMPLE appeared!",waited_for_input:true}]};
  else if(path==="/action"){if(typeof init?.body!=="string")throw new Error("body");presses.push(...(JSON.parse(init.body) as {buttons:string[]}).buttons);current=ready;body={status:"success"};}
  else if(path==="/queue_status")body={queue_empty:true};
  else throw new Error(path);
  return Promise.resolve(new Response(JSON.stringify(body)));
 }) satisfies typeof fetch);
 const preset={version:2,id:"battle-ready-entry",target:null,limits:{maxTurns:10,maxWallMs:600000,failureLimit:3},sampling:{thinkingLevel:"medium",maxTokens:100},features:{...flagFeatures({loopGuard:false,activeUi:true,interfaceDocs:true,objectives:false}),"field-dialogue-phase-v1":true,"dialogue-auto-advance-v1":true,"battle-text-auto-advance-v1":true,"battle-decision-ready-v1":true}};
 owner.files.set("/test-owned/battle-ready-preset.json",[JSON.stringify(preset)]);
 vi.stubEnv("POKEBENCH_PLAY_PRESET","/test-owned/battle-ready-preset.json");vi.stubEnv("POKEBENCH_RUN_ID","battle-ready-entry");
 vi.spyOn(console,"log").mockImplementation(()=>undefined);
 const done=new Promise<RunPlan>((resolve,reject)=>{owner.resolve=resolve;owner.reject=reject;});
 vi.stubGlobal("process",Object.assign(Object.create(process) as NodeJS.Process,{argv:[...process.argv.slice(0,2),"play"]}));
 await import("./live.js");await done;
 expect(presses).toEqual(["B"]);
 expect(owner.context).toContain("Wild WURMPLE appeared!");
 expect(owner.context).toContain("battle action menu is ready");
 expect(owner.context).toContain("input");
 expect(owner.start?.harness_features).toContain("battle-decision-ready-v1");
 const events=[...owner.files.entries()].filter(([path])=>path.endsWith("/events.jsonl")).flatMap(([,chunks])=>chunks.join("").trim().split("\n").map(parseEvent));
 expect(events.find(e=>e.type==="dialogue_auto_advance")).toMatchObject({tool:"observe",stop:"battle_input",battle_auto_presses:1});
 const snapshot=events.find(e=>e.type==="decision_input");
 expect(snapshot).toMatchObject({decision_turn:1,text:expect.stringContaining("Wild WURMPLE appeared!") as string,frames:[{path:expect.stringMatching(/frames\//) as string}]});
 if(snapshot?.type!=="decision_input")throw new Error("missing readiness snapshot");
 expect(events.find(e=>e.seq===snapshot.state_seq)).toMatchObject({type:"state",battle:{text_phase:"input"}});
});
