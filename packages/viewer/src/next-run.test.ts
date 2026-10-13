import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ALL_ON } from "@pokebench/agent/features";
import { Log, START } from "../test-support/events.js";
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
    expect(writeDraft(runsRoot, draft)).toEqual(draft);
    expect(readDraft(runsRoot)).toEqual(draft);
    expect(() => writeDraft(runsRoot, { ...draft, features: { ...ALL_ON, "live-map-v1": false } })).toThrow(/world-coordinate-grid-v1 needs live-map-v1/);
    expect(() => writeDraft(runsRoot, { ...draft, extra: 1 })).toThrow(NextRunError);
    writeFileSync(join(runsRoot, ".viewer", "next-run.json"), "garbage");
    expect(readDraft(runsRoot)).toEqual(DEFAULT_NEXT_RUN);
  });

  it("turns a draft into a v2 play preset", () => {
    expect(presetFor({ ...draft, target: "RIVAL_MET" }, "r1")).toEqual({ version: 2, id: "viewer-r1", target: "RIVAL_MET", limits: { maxTurns: 300, maxWallMs: 1_800_000, failureLimit: 3 }, sampling: { thinkingLevel: "medium", maxTokens: 4096 }, features: ALL_ON });
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
    launch: (spec) => { launches.push(spec); expect(existsSync(join(runsRoot, LEASE, "owner.json"))).toBe(true); return new Promise((resolve) => { finish = resolve; }); } };
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
    expect(() => queue.enqueue(draft)).not.toThrow();
    const { rmSync } = await import("node:fs"); rmSync(join(runsRoot, LEASE), { recursive: true });
    const running = queue.tick();
    await vi.waitFor(() => { expect(queue.status()).toEqual({ state: "running", runId: "2026-10-13T12-00-00_Qwen3.8-Flash_ab12" }); });
    expect(() => queue.enqueue(draft)).toThrow(/already launching or running/);
    expect(launches).toHaveLength(1);
    const [spec] = launches;
    expect(spec?.argv).toEqual(["/repo/packages/agent/dist/live.js", "play"]);
    expect(spec?.env).toEqual({ POKEBENCH_PLAY_PRESET: join(runsRoot, ".viewer", "presets", "2026-10-13T12-00-00_Qwen3.8-Flash_ab12.json"), POKEBENCH_RUN_ID: "2026-10-13T12-00-00_Qwen3.8-Flash_ab12", POKEBENCH_MODEL: "Qwen3.8-Flash", POKEBENCH_ENDPOINT_FILE: "/tmp/endpoint.json", POKEBENCH_GAME_SERVER_URL: "http://127.0.0.1:8076" });
    expect(JSON.parse(readFileSync(spec?.env["POKEBENCH_PLAY_PRESET"] ?? "", "utf8"))).toMatchObject({ version: 2, features: ALL_ON });
    finish(0);
    await running;
    expect(queue.status()).toEqual({ state: "idle" });
    expect(existsSync(join(runsRoot, LEASE))).toBe(false);
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
    const code = await spawnLaunch({ runId: "x", argv: ["-e", "console.log(process.env.POKEBENCH_RUN_ID); console.error('e')"], env: { POKEBENCH_RUN_ID: "x" }, stdout: join(dir, "out.log"), stderr: join(dir, "err.log") });
    expect(code).toBe(0);
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
