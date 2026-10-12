import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { parseEvent, type RunEvent } from "./events.js";
import type { RunHost, RunPlan } from "./run.js";

const context = vi.hoisted(() => ({ root: "", resolve: undefined as ((event: RunEvent) => void) | undefined, reject: undefined as ((error: unknown) => void) | undefined }));
vi.mock("./config.js", () => ({ loadConfig: () => ({ model: "fixture-vlm", gameServerUrl: "http://127.0.0.1:8123", gatewayUrl: "http://fixture.invalid/v1", visionModels: [], endpointFile: null }) }));
vi.mock("./gateway.js", () => ({
  discoverModels: () => Promise.resolve([]),
  selectModel: () => ({ id: "fixture-vlm", input: ["text", "image"], contextWindow: 1000, maxTokens: 100 }),
}));
vi.mock("node:readline", () => ({ createInterface: () => ({ close: () => undefined, async *[Symbol.asyncIterator]() { yield await Promise.resolve(""); } }) }));
vi.mock("./run.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./run.js")>();
  const { FrameStore } = await import("./frames.js");
  return { ...actual, withRun: async (plan: RunPlan) => {
    const fake: RunHost = {
      serverHealthy: () => Promise.resolve(false),
      launchServer: (dir) => Promise.resolve({ serverDir: join(dir, "server"), stop: () => Promise.resolve() }),
      harness: () => ({ commit: "1".repeat(40), dirty: false }),
      vendorPin: () => "bbab97ad73e460b7cd7c08527d10ced30cc03fbe",
      milestones: { poll: () => Promise.resolve([]) },
      gameState: { read: () => Promise.resolve({ screen: "title", started: false, name: null, location: null, map_id: null, position: null, facing: null, in_battle: false, party: [], money: null, badges: [], play_time_s: null }) },
    };
    try {
      const result = await actual.withRun({ ...plan, runsRoot: context.root }, fake, new FrameStore(context.root, 1000, () => undefined), () => Promise.resolve("completed"));
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
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); if (context.root !== "") rmSync(context.root, { recursive: true, force: true }); });
it.each(["smoke", "play", "probe", "verify-state"])("%s declares world advantages in the real run_start publisher", async (command) => {
  vi.resetModules();
  context.root = mkdtempSync(join(tmpdir(), "pokebench-world-features-"));
  const receipt = new Promise<RunEvent>((resolve, reject) => { context.resolve = resolve; context.reject = reject; });
  vi.stubGlobal("process", Object.assign(Object.create(process) as NodeJS.Process, { argv: [...process.argv.slice(0, 2), command] }));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await import("./live.js");
  const start = await receipt;
  if (start.type !== "run_start") throw new Error("unexpected startup event");
  const declared = start.harness_features.filter((f) => f.startsWith("world-") || f === "live-player-position-v1" || f === "press-result-v1");
  expect(declared).toEqual(["world-targets-v1", "live-player-position-v1", "world-coordinate-grid-v1", "press-result-v1"]);
});
