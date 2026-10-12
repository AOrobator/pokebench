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

