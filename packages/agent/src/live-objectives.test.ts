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

const owner = vi.hoisted(() => ({ files: new Map<string, string[]>(), loop: null as PiLoopOptions | null, start: null as Extract<RunEvent, { type: "run_start" }> | null, context: "", clock:null as (()=>number)|null, resolve: undefined as ((plan: RunPlan) => void) | undefined, reject: undefined as ((error: unknown) => void) | undefined }));
vi.mock("node:fs", async (load) => {
  const actual = await load<typeof import("node:fs")>();
  return { ...actual, mkdirSync: () => undefined, readdirSync: () => [],
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
  return { ...actual, piLoop: (options: PiLoopOptions) => { owner.loop = options;return { start: () => Promise.resolve(), resume: () => Promise.resolve() }; }, play: async () => { owner.context = JSON.stringify(await owner.loop?.transformContext([] as AgentMessage[]));return "completed"; } };
});
vi.mock("./run.js", async (load) => {
  const actual = await load<typeof import("./run.js")>();const { FrameStore } = await import("./frames.js");
  return { ...actual, withRun: async (plan: RunPlan, _host: RunHost, _frames: InstanceType<typeof FrameStore>, body: (recorder: RunRecorder, url: string) => Promise<import("./events.js").RunEndReason>) => {
    const host: RunHost = {
      serverHealthy: () => Promise.resolve(false), launchServer: (dir) => Promise.resolve({ serverDir: `${dir}/server`, stop: () => Promise.resolve() }),
      harness: () => ({ commit: "1".repeat(40), dirty: false }), vendorPin: () => "bbab97ad73e460b7cd7c08527d10ced30cc03fbe",
      milestones: { poll: () => Promise.resolve([]) },
      gameState: { nativeActions:()=>Promise.resolve({frame:0,last_id:0,entries:[]}), battleChoices:()=>Promise.resolve({frame:0,last_id:0,entries:[]}), read: () => Promise.resolve({ screen: "title", started: false, name: null, location: null, map_id: null, position: null, facing: null, in_battle: false, party: [], money: null, badges: [], play_time_s: null,story:{...NAME_CONFIRMED.story,name_confirmed:false} }) },
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
afterEach(() => { vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();owner.files.clear();owner.loop = null;owner.start = null;owner.clock=null; });
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

it("records a preset's replyFailuresEndRun in run_start and keeps playing through reply failures", async () => {
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
  const loop=currentLoop();if(loop===null)throw new Error("missing actual preset governor");
  for(let i=0;i<6;i++)loop.governor.afterTurn(assistant({}),[]);
  expect(loop.governor.stopReason).toBeNull();
});
