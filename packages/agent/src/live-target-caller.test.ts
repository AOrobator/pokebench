import { ChildProcess, type SpawnOptions } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import type { Model } from "@mariozechner/pi-ai";
import type { RunHost, RunPlan } from "./run.js";
import type { RunRecorder } from "./recorder.js";
import type { RunEndReason } from "./events.js";
import type { FrameStore } from "./frames.js";
import { parseEvent } from "./events.js";
import { NAME_CONFIRMED } from "../test-support/events.js";
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
function currentLaunch(): typeof owner.spawn {
  return owner.spawn;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  if (owner.root !== "") rmSync(owner.root, { recursive: true, force: true });
  owner.root = "";
  owner.spawn = null;
  owner.child = null;
});

it.each([
  [599999, false],
  [600000, true],
  [600001, false],
] as const)(
  "actual live native callback respects pending deadline and child UI env (target=%s, UI=%s)",
  async (at, activeUi) => {
    vi.resetModules();
    owner.root = mkdtempSync(join(tmpdir(), "live-target-caller-"));
    const romPath=join(owner.root,"fixture.gba");
    writeFileSync(romPath,"test-owned ROM identity fixture");
    vi.stubEnv("POKEBENCH_ROM",romPath);
    owner.elapsed = 0;
    owner.at = at;
    owner.observed = false;
    owner.launched = false;
    owner.exited = false;
    owner.requests = [];
    owner.inferences = 0;
    owner.spawn = null;
    const preset = {
      version: 1,
      id: "caller",
      target: "PLAYER_NAME_CONFIRMED",
      limits: { maxTurns: 3, maxWallMs: 600000, failureLimit: 3 },
      sampling: { thinkingLevel: "medium", maxTokens: 100 },
      flags: {
        loopGuard: false,
        activeUi,
        interfaceDocs: true,
        objectives: false,
      },
    };
    const path = join(owner.root, "preset.json");
    writeFileSync(path, JSON.stringify(preset));
    vi.stubEnv("POKEBENCH_PLAY_PRESET", path);
    vi.stubEnv("POKEBENCH_RUN_ID", "live-native-caller");
    vi.stubEnv("POKEBENCH_ACTIVE_UI", activeUi ? "0" : "1");
    vi.spyOn(process, "kill").mockImplementation((pid) => {
      expect(pid).toBe(-987654);
      const child = owner.child;
      if (child === null) throw new Error("missing owned child");
      owner.exited = true;
      child.emit("exit", 0, null);
      return true;
    });
    vi.stubGlobal(
      "process",
      Object.assign(Object.create(process) as NodeJS.Process, {
        argv: [...process.argv.slice(0, 2), "play"],
      }),
    );
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const named={...NAME_CONFIRMED,game_stats:null,blackout_active:false,raw_ram:{v:1 as const,sequence:0,frame:0,path:"raw-ram/00000000.json.gz",sha256:"a".repeat(64)}};
    const initial = {
      ...named,
      story: { ...NAME_CONFIRMED.story, name_confirmed: false },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockImplementation((input, init) => {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const route = new URL(url).pathname;
        owner.requests.push(`${init?.method ?? "GET"} ${route}`);
        if (route === "/health")
          return Promise.resolve(
            new Response(
              JSON.stringify({
                status: owner.launched ? "healthy" : "unavailable",
              }),
            ),
          );
        if (route === "/pokebench/battle/choices" || route === "/pokebench/actions")return Promise.resolve(Response.json({frame:0,last_id:0,entries:[]}));
        if (route === "/pokebench/state")
          return Promise.resolve(
            new Response(
              JSON.stringify(owner.observed ? named : initial),
            ),
          );
        if (route === "/pokebench/observation") {
          owner.elapsed = owner.at;
          owner.observed = true;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                state_text: "Accepted trainer name",
                state: named,
                screenshot_base64: FRAME.toString("base64"),
              }),
            ),
          );
        }
        if (route === "/action")
          return Promise.resolve(
            new Response(
              JSON.stringify({
                status: "error",
                message: "trailing action fixture",
              }),
            ),
          );
        throw new Error(`Unexpected fixture route ${route}`);
      }),
    );
    const done = new Promise<RunEndReason>((resolve, reject) => {
      owner.resolve = resolve;
      owner.reject = reject;
    });
    await import("./live.js");
    const reason = await done;
    expect(reason).toBe(at <= 600000 ? "milestone" : "budget");
    expect(owner.inferences).toBe(1);
    expect(
      owner.requests.filter((request) => request.startsWith("POST")),
    ).toEqual([]);
    const launch = currentLaunch();
    if (launch === null)
      throw new Error("realHost never spawned the owned server");
    expect(launch.command.endsWith("/env/.venv/bin/python")).toBe(true);
    expect(launch.args).toEqual([
      "-m",
      "pokebench_env.launcher",
      "--run-dir",
      join(owner.root, "live-native-caller"),
      "--run-id",
      "live-native-caller",
      "--port",
      "8123",
    ]);
    expect(launch.options.env?.["POKEBENCH_ACTIVE_UI"]).toBe(
      activeUi ? "1" : "0",
    );
    const events = readFileSync(
      join(owner.root, "live-native-caller/events.jsonl"),
      "utf8",
    )
      .trim()
      .split("\n")
      .map(parseEvent);
    const start = events[0];
    expect(start).toMatchObject({
      type: "run_start",
      evaluation: { flags: preset.flags },
    });
    if (start?.type !== "run_start") throw new Error("missing actual start");
    expect(start.harness_features.includes("active-ui-ownership-v1")).toBe(
      activeUi,
    );
    const end = events.at(-1);
    if (end?.type !== "run_end") throw new Error("missing actual terminal");
    if (at <= 600000) {
      const mark = events.find(
        (event) =>
          event.type === "milestone" && event.name === "PLAYER_NAME_CONFIRMED",
      );
      if (mark?.type !== "milestone")
        throw new Error("missing produced native milestone");
      expect(end.target_proof).toEqual({
        name: mark.name,
        milestone_seq: mark.seq,
        state_evidence: mark.evidence,
      });
    } else expect(end.target_proof).toBeUndefined();
    expect(events.filter((event) => event.type === "retry")).toEqual([]);
    const result = events.find(
      (event) => event.type === "tool_result" && event.id === "accept",
    );
    if (result?.type !== "tool_result")
      throw new Error("missing current tool result");
    expect(result.is_error).toBe(false);
    expect(result.frames).toHaveLength(1);
    const frame = result.frames[0];
    if (frame === undefined) throw new Error("missing current frame");
    expect(frame.sha1).toBe(createHash("sha1").update(FRAME).digest("hex"));
    expect(
      readFileSync(join(owner.root, "live-native-caller", frame.path)),
    ).toEqual(FRAME);
  },
);
