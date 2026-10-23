import { ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { Model } from "@mariozechner/pi-ai";
import type { RunHost, RunPlan } from "./run.js";
import type { RunRecorder } from "./recorder.js";
import type { RunEndReason } from "./events.js";
import type { FrameStore } from "./frames.js";
import { parseEvent } from "./events.js";
import { NAME_CONFIRMED } from "../test-support/events.js";
import { flagFeatures } from "./play-preset.js";
import { STALL_STOP_MS } from "./run-control.js";
import { assistant, toolCall } from "../test-support/pi.js";

const owner = vi.hoisted(() => ({
  root: "",
  elapsed: 0,
  at: 0,
  observed: false,
  launched: false,
  exited: false,
  requests: [] as string[],
  inferences: 0,
  spawn: null as {
    command: string;
    args: readonly string[];
    options: SpawnOptions;
  } | null,
  child: null as ChildProcess | null,
  resolve: null as ((value: RunEndReason) => void) | null,
  reject: null as ((error: unknown) => void) | null,
}));
const MODEL: Model<"openai-completions"> = {
  id: "fixture-vlm",
  name: "fixture-vlm",
  api: "openai-completions",
  provider: "fixture",
  baseUrl: "http://fixture.invalid/v1",
  reasoning: false,
  input: ["text", "image"],
  contextWindow: 1000,
  maxTokens: 100,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
// The real game-tools boundary checks the PNG signature and 240x160 IHDR.
// This test-owned header exercises that boundary; no real vision/model claim.
const FRAME = Buffer.alloc(33);
Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(FRAME);
FRAME.writeUInt32BE(13, 8);
FRAME.write("IHDR", 12, "ascii");
FRAME.writeUInt32BE(240, 16);
FRAME.writeUInt32BE(160, 20);
vi.mock("node:child_process", async (load) => {
  const actual = await load<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: (
      command: string,
      args: readonly string[],
      options: SpawnOptions,
    ) => {
      const child = new actual.ChildProcess();
      Object.defineProperty(child, "pid", { value: 987654 });
      Object.defineProperty(child, "exitCode", {
        get: () => (owner.exited ? 0 : null),
      });
      owner.child = child;
      owner.launched = true;
      owner.spawn = { command, args: [...args], options };
      return child;
    },
    execFileSync: (
      _command: string,
      args: readonly string[],
      options: { cwd?: string; encoding?: string },
    ) =>
      args[0] === "status"
        ? ""
        : options.cwd?.includes("continual-harness")
          ? "bbab97ad73e460b7cd7c08527d10ced30cc03fbe"
          : "1".repeat(40),
  };
});
vi.mock("./config.js", () => ({
  loadConfig: () => ({
    model: "fixture-vlm",
    gameServerUrl: "http://127.0.0.1:8123",
    gatewayUrl: "http://fixture.invalid/v1",
    visionModels: [],
    endpointFile: null,
  }),
}));
vi.mock("./gateway.js", () => ({
  discoverModels: () => Promise.resolve([]),
  selectModel: () => MODEL,
}));
vi.mock("./recorder.js", async (load) => {
  const actual = await load<typeof import("./recorder.js")>();
  return {
    ...actual,
    RunRecorder: class extends actual.RunRecorder {
      override elapsedMs(): number {
        return owner.elapsed;
      }
    },
  };
});
vi.mock("./harness.js", async (load) => {
  const actual = await load<typeof import("./harness.js")>();
  const { createAssistantMessageEventStream } =
    await import("@mariozechner/pi-ai");
  return {
    ...actual,
    piLoop: (options: Parameters<typeof actual.piLoop>[0]) =>
      actual.piLoop({
        ...options,
        streamFn: () => {
          owner.inferences++;
          const stream = createAssistantMessageEventStream();
          const message =
            owner.inferences === 1
              ? assistant({
                  toolCalls: [
                    toolCall("accept", "observe", {}),
                    toolCall("trailing", "press", { buttons: ["A"] }),
                  ],
                  stopReason: "toolUse",
                })
              : assistant({ text: "fixture follow-up", stopReason: "stop" });
          stream.push({
            type: "done",
            reason: message.stopReason === "toolUse" ? "toolUse" : "stop",
            message,
          });
          return stream;
        },
      }),
  };
});
vi.mock("./run.js", async (load) => {
  const actual = await load<typeof import("./run.js")>();
  const { FrameStore } = await import("./frames.js");
  return {
    ...actual,
    withRun: async (
      plan: RunPlan,
      host: RunHost,
      _frames: FrameStore,
      body: (recorder: RunRecorder, url: string) => Promise<RunEndReason>,
    ) => {
      try {
        const reason = await actual.withRun(
          { ...plan, runsRoot: owner.root },
          host,
          new FrameStore(owner.root),
          body,
        );
        owner.resolve?.(reason);
        return reason;
      } catch (error) {
        owner.reject?.(error);
        throw error;
      }
    },
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (owner.root !== "") rmSync(owner.root, { recursive: true, force: true });
  owner.root = "";
  owner.spawn = null;
  owner.child = null;
});

// milestone-stall-stop-v1 through the real live.ts play path: the run clock already
// stands at ten minutes and no milestone is new (all present at start), so the switch
// must end the run as stalled; OFF must leave the run to its other stops.
it.each([true, false] as const)("live play honours milestone-stall-stop-v1=%s", async (on) => {
  vi.resetModules();
  owner.root = mkdtempSync(join(tmpdir(), "live-stall-stop-"));
  const romPath = join(owner.root, "fixture.gba");
  writeFileSync(romPath, "test-owned ROM identity fixture");
  vi.stubEnv("POKEBENCH_ROM", romPath);
  owner.elapsed = STALL_STOP_MS;
  owner.observed = false;
  owner.launched = false;
  owner.exited = false;
  owner.requests = [];
  owner.inferences = 0;
  owner.spawn = null;
  const preset = {
    version: 2,
    id: "stall",
    target: null,
    limits: { maxTurns: 3, maxWallMs: 45 * 60_000, failureLimit: 3 },
    sampling: { thinkingLevel: "medium", maxTokens: 100 },
    features: { ...flagFeatures({ loopGuard: false, activeUi: true, interfaceDocs: true, objectives: false }), "milestone-stall-stop-v1": on },
  };
  const path = join(owner.root, "preset.json");
  writeFileSync(path, JSON.stringify(preset));
  vi.stubEnv("POKEBENCH_PLAY_PRESET", path);
  vi.stubEnv("POKEBENCH_RUN_ID", "live-stall-stop");
  vi.spyOn(process, "kill").mockImplementation(() => {
    const child = owner.child;
    if (child === null) throw new Error("missing owned child");
    owner.exited = true;
    child.emit("exit", 0, null);
    return true;
  });
  vi.stubGlobal("process", Object.assign(Object.create(process) as NodeJS.Process, { argv: [...process.argv.slice(0, 2), "play"] }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  const named = { ...NAME_CONFIRMED, game_stats: null, blackout_active: false, route103_rival: null, story_progress:null, raw_ram: { v: 1 as const, sequence: 0, frame: 0, path: "raw-ram/00000000.json.gz", sha256: "a".repeat(64) } };
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const route = new URL(url).pathname;
    owner.requests.push(`${init?.method ?? "GET"} ${route}`);
    if (route === "/health") return Promise.resolve(Response.json({ status: owner.launched ? "healthy" : "unavailable" }));
    if (route === "/pokebench/battle/choices" || route === "/pokebench/actions") return Promise.resolve(Response.json({ frame: 0, last_id: 0, entries: [] }));
    if (route === "/pokebench/state") return Promise.resolve(Response.json(named));
    // The observation answers on a later macrotask, so a due timer gets its turn.
    if (route === "/pokebench/observation") return new Promise<Response>((resolve) => { setTimeout(resolve, 20); }).then(() => Response.json({ state_text: "Accepted trainer name", state: named, screenshot_base64: FRAME.toString("base64") }));
    if (route === "/action") return Promise.resolve(Response.json({ status: "error", message: "trailing action fixture" }));
    throw new Error(`Unexpected fixture route ${route}`);
  }));
  const done = new Promise<RunEndReason>((resolve, reject) => { owner.resolve = resolve; owner.reject = reject; });
  await import("./live.js");
  const reason = await done;
  const events = readFileSync(join(owner.root, "live-stall-stop/events.jsonl"), "utf8").trim().split("\n").map(parseEvent);
  const start = events[0];
  if (start?.type !== "run_start") throw new Error("missing actual start");
  expect(start.harness_features.includes("milestone-stall-stop-v1")).toBe(on);
  const end = events.at(-1);
  if (end?.type !== "run_end") throw new Error("missing actual terminal");
  expect(end.reason).toBe(reason);
  if (on) expect(reason).toBe("stalled");
  else expect(reason).not.toBe("stalled");
});
