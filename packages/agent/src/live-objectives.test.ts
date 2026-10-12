import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { PiLoopOptions } from "./harness.js";
import type { RunHost, RunPlan } from "./run.js";
import type { RunRecorder } from "./recorder.js";
import { parseEvent, type RunEvent } from "./events.js";

const owner = vi.hoisted(() => ({ files: new Map<string, string[]>(), loop: null as PiLoopOptions | null, context: "", resolve: undefined as ((plan: RunPlan) => void) | undefined, reject: undefined as ((error: unknown) => void) | undefined }));
vi.mock("node:fs", async (load) => {
  const actual = await load<typeof import("node:fs")>();
  return { ...actual, mkdirSync: () => undefined, readdirSync: () => [],
    appendFileSync: (path: Parameters<typeof actual.appendFileSync>[0], data: Parameters<typeof actual.appendFileSync>[1]) => {
      const key = String(path);const chunks = owner.files.get(key) ?? [];chunks.push(String(data));owner.files.set(key, chunks);
    },
    readFileSync: (path: Parameters<typeof actual.readFileSync>[0]) => {
      if (path instanceof URL && path.pathname.endsWith("/package.json")) return JSON.stringify({ dependencies: { "@mariozechner/pi-agent-core": "fixture-version" } });
      const chunks = owner.files.get(String(path));if (!chunks) throw new Error(`unknown test-owned file ${String(path)}`);return chunks.join("");
    },
  };
});
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
      gameState: { read: () => Promise.resolve({ screen: "title", started: false, name: null, location: null, map_id: null, position: null, facing: null, in_battle: false, party: [], money: null, badges: [], play_time_s: null }) },
    };
    try {
      const root = "/test-owned/objective-entrypoint";
      const result = await actual.withRun({ ...plan, runsRoot: root }, host, new FrameStore(root, 1000, () => undefined), body);
      const events = readFileSync(`${root}/${plan.runId}/events.jsonl`, "utf8").trim().split("\n").map((line) => parseEvent(line));
      expect(events.filter((event: RunEvent) => event.type === "run_end")).toHaveLength(1);
      owner.resolve?.(plan);return result;
    } catch (error) { owner.reject?.(error);throw error; }
  } };
});
function currentLoop(): PiLoopOptions | null { return owner.loop; }
afterEach(() => { vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();owner.files.clear();owner.loop = null; });
it.each([undefined, "0"])("actual play entrypoint agrees on tools, context, prompt and metadata (flag=%s)", async (flag) => {
  vi.resetModules();owner.files.clear();owner.loop = null;
  const done = new Promise<RunPlan>((resolve, reject) => { owner.resolve = resolve;owner.reject = reject; });
  vi.stubEnv("POKEBENCH_OBJECTIVES", flag);
  vi.stubGlobal("process", Object.assign(Object.create(process) as NodeJS.Process, { argv: [...process.argv.slice(0, 2), "play"] }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await import("./live.js");const plan = await done;const loop = currentLoop();
  if (!loop) throw new Error("entrypoint did not create model loop");
  const enabled = flag !== "0";
  const tools = ["observe", "press", ...(enabled ? ["get_objectives", "set_objective", "update_objective"] : [])];
  expect(loop.tools.map((tool) => tool.name)).toEqual(tools);expect(plan.tools).toEqual(tools);
  expect(plan.systemPrompt.includes("Model memory is a hypothesis")).toBe(enabled);
  expect(plan.harnessFeatures.includes("objective-tracking-v1")).toBe(enabled);
  expect(plan.harnessFeatures.includes("repeat-attempt-guard-v1")).toBe(enabled);
  expect(loop.systemPrompt).toBe(plan.systemPrompt);
  expect(owner.context.includes("HARNESS OBJECTIVE RECORD")).toBe(enabled);
});
