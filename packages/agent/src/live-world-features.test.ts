import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { parseEvent, type RunEvent } from "./events.js";
import type { RunHost, RunPlan } from "./run.js";

const context = vi.hoisted(() => ({ root: "", memory: true, captureRuntime:false, runtimeModes:[] as string[], files: new Map<string, string[]>(), resolve: undefined as ((event: RunEvent) => void) | undefined, reject: undefined as ((error: unknown) => void) | undefined }));
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
      gameState: { read: () => Promise.resolve({ screen: "title", started: false, name: null, location: null, map_id: null, position: null, facing: null, in_battle: false, party: [], money: null, badges: [], play_time_s: null }) },
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
  return {start:()=>{options.governor.abort("completed");return Promise.resolve([]);},resume:()=>Promise.resolve([])};
 }};
});
afterEach(() => { context.captureRuntime=false;context.runtimeModes=[];vi.unstubAllGlobals(); vi.restoreAllMocks(); if (!context.memory && context.root !== "") rmSync(context.root, { recursive: true, force: true }); context.files.clear(); });
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
