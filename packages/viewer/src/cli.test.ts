import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { CliError, DEFAULT_PORT, closeOnSignals, main, parseArgs, viewerOffload, viewUrl } from "./cli.js";
import type { BaselineRequest, BaselineWorkerLike } from "./baseline-pool.js";
import { RunQueue } from "./next-run.js";

describe("parseArgs", () => {
  it("defaults to the repo's runs/ on port 8790 with no run", () => {
    expect(parseArgs([], "/repo/runs")).toEqual({ runId: null, port: DEFAULT_PORT, runsRoot: "/repo/runs", currentDatabase: "/repo/runs/.viewer-cache/current-v1/current.sqlite", endpointFile: null, publicOrigins: [] });
    expect(parseArgs(["--endpoint-file", "/e.json"], "/r", "/default.json").endpointFile).toBe("/e.json");
    expect(parseArgs([], "/r", "/default.json").endpointFile).toBe("/default.json");
    expect(DEFAULT_PORT).toBe(8790);
  });

  it("takes a run id, a port and a runs directory", () => {
    expect(parseArgs(["2026-10-11T22-16-26_think-swarm_890b", "--port", "9001", "--runs", "/other/runs"], "/repo/runs")).toEqual({
      runId: "2026-10-11T22-16-26_think-swarm_890b",
      port: 9001,
      runsRoot: "/other/runs",
      currentDatabase: "/other/runs/.viewer-cache/current-v1/current.sqlite",
      endpointFile: null,
      publicOrigins: [],
    });
    expect(parseArgs([""], "/r").runId).toBeNull();
  });

  it.each([
    [["--port", "80"]],
    [["--port", "abc"]],
    [["--port"]],
    [["--runs"]],
    [["--endpoint-file"]],
    [["../x"]],
    [["a", "b"]],
    [["--host", "0.0.0.0"]],
    [["--public-origin"]],
    [["--public-origin", "not a url"]],
    [["--public-origin", "ftp://studio.example.ts.net:8447"]],
    [["--public-origin", "https://studio.example.ts.net:8447/viewer"]],
    [["--public-origin", "https://studio.example.ts.net:8447/?x=1"]],
    [["--public-origin", "https://user@studio.example.ts.net:8447"]],
  ])("rejects %j", (argv) => {
    expect(() => parseArgs(argv, "/r")).toThrow(CliError);
  });
});

describe("public origins", () => {
  it("come from --public-origin, repeatable, normalized to the origin", () => {
    expect(parseArgs(["--public-origin", "https://studio.example.ts.net:8447/", "--public-origin", "https://other.example.ts.net"], "/r").publicOrigins).toEqual(["https://studio.example.ts.net:8447", "https://other.example.ts.net"]);
  });

  it("default to the environment list, which the flag replaces", () => {
    expect(parseArgs([], "/r", null, "https://a.example.ts.net:8447, https://b.example.ts.net:8447").publicOrigins).toEqual(["https://a.example.ts.net:8447", "https://b.example.ts.net:8447"]);
    expect(parseArgs([], "/r", null, " ").publicOrigins).toEqual([]);
    expect(parseArgs(["--public-origin", "https://c.example.ts.net:8447"], "/r", null, "https://a.example.ts.net:8447").publicOrigins).toEqual(["https://c.example.ts.net:8447"]);
    expect(() => parseArgs([], "/r", null, "ws://a.example.ts.net:8447")).toThrow(CliError);
  });

  it("accept a cleartext LAN origin next to the tailnet one", () => {
    expect(parseArgs([], "/r", null, "https://a.example.ts.net:8447,http://inference.example:8790").publicOrigins).toEqual(["https://a.example.ts.net:8447", "http://inference.example:8790"]);
  });
});

describe("viewUrl", () => {
  it("opens the run in the hash", () => {
    expect(viewUrl("http://127.0.0.1:8790/", null)).toBe("http://127.0.0.1:8790/");
    expect(viewUrl("http://127.0.0.1:8790/", "r 1")).toBe("http://127.0.0.1:8790/#run=r%201");
  });
});

describe("main", () => {
  it("starts the viewer on 127.0.0.1 and prints where to look", async () => {
    const start = vi.fn().mockResolvedValue({ url: "http://127.0.0.1:8790/", port: 8790, address: "127.0.0.1", close: () => Promise.resolve() });
    const lines: string[] = [];
    await main(["abc", "--runs", "/x/runs"], { repoRunsRoot: "/repo/runs", defaultEndpoint: "/e.json", liveJs: "/l.js", staticDir: "/s", appDir: "/a", start, print: (line) => lines.push(line) });
    expect(start).toHaveBeenCalledWith({ runsRoot: "/x/runs", current: { database: "/x/runs/.viewer-cache/current-v1/current.sqlite" }, staticDir: "/s", appDir: "/a", port: 8790, endpointFile: "/e.json", publicOrigins: [], queue: expect.any(RunQueue) as unknown, restartHuman: expect.any(Function) as unknown, frontier: { file: "/x/runs/.viewer-cache/frontier-v1.json", warm: true } });
    expect(lines).toEqual(["PokeBench viewer: http://127.0.0.1:8790/#run=abc", "runs: /x/runs (Ctrl-C to stop)", "next runs: local models from /e.json"]);
    await main(["--runs", "/x/runs"], { repoRunsRoot: "/repo/runs", defaultEndpoint: null, liveJs: "/l.js", staticDir: "/s", appDir: "/a", start, print: (line) => lines.push(line) });
    expect(lines.at(-1)).toBe("next runs: no local model endpoint file; queueing is disabled");
  });

  it("hands the viewer the workers built for its runs directory", async () => {
    const start = vi.fn().mockResolvedValue({ url: "http://127.0.0.1:8790/", port: 8790, address: "127.0.0.1", close: () => Promise.resolve() });
    const baselines = { warm: true, close: () => Promise.resolve() }, workbench = {};
    const roots: string[] = [];
    await main(["--runs", "/x/runs"], { repoRunsRoot: "/repo/runs", defaultEndpoint: null, liveJs: "/l.js", staticDir: "/s", appDir: "/a", start, print: () => undefined, offload: (root) => { roots.push(root); return { baselines, workbench }; } });
    expect(roots).toEqual(["/x/runs"]);
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ baselines, workbench }));
  });

  it("prints each public origin with the run in the hash", async () => {
    const start = vi.fn().mockResolvedValue({ url: "http://127.0.0.1:8790/", port: 8790, address: "127.0.0.1", close: () => Promise.resolve() });
    const lines: string[] = [];
    await main(["abc"], { repoRunsRoot: "/repo/runs", defaultEndpoint: null, defaultPublicOrigins: "https://studio.example.ts.net:8447", liveJs: "/l.js", staticDir: "/s", appDir: "/a", start, print: (line) => lines.push(line) });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ publicOrigins: ["https://studio.example.ts.net:8447"] }));
    expect(lines.slice(0, 2)).toEqual(["PokeBench viewer: http://127.0.0.1:8790/#run=abc", "also published at: https://studio.example.ts.net:8447/#run=abc"]);
  });
});

describe("production log reduction", () => {
  it("stays cold after restart and serializes mixed requested reductions on one worker", async () => {
    const root = mkdtempSync(join(tmpdir(), "viewer-offload-"));
    try {
      const requests: BaselineRequest[] = [];
      const worker: BaselineWorkerLike = {
        postMessage: (message) => { requests.push(message); },
        on: () => undefined,
        terminate: () => Promise.resolve(0),
        unref: () => undefined,
      };
      let spawns = 0;
      const offload = viewerOffload(root, new URL("file:///held-worker.js"), "a".repeat(64), 32, () => {
        spawns += 1;
        return worker;
      });
      expect(offload.baselines?.warm).not.toBe(true);
      const baseline = offload.baselines?.compute;
      const workbench = offload.workbench?.compute;
      if (baseline === undefined || workbench === undefined) throw new Error("production offload omitted its reducers");
      const jobs = [baseline(root, "a"), baseline(root, "b"), workbench(root, "c", null)];
      expect(spawns).toBe(1);
      expect(requests).toHaveLength(1);
      await offload.baselines?.close?.();
      await Promise.allSettled(jobs);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("shutdown", () => {
  it("closes the viewer on SIGTERM or SIGINT and exits without touching the runs it launched", async () => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      const handlers = new Map<string, () => void>();
      const close = vi.fn(() => Promise.resolve());
      const exits: number[] = [];
      closeOnSignals({ close }, (name, handler) => { handlers.set(name, handler); }, (code) => { exits.push(code); });
      expect([...handlers.keys()].sort()).toEqual(["SIGINT", "SIGTERM"]);
      handlers.get(signal)?.();
      await vi.waitFor(() => { expect(exits).toEqual([0]); });
      expect(close).toHaveBeenCalledTimes(1);
    }
  });

  it("exits at once on a second signal when closing hangs", () => {
    const handlers = new Map<string, () => void>();
    const exits: number[] = [];
    closeOnSignals({ close: () => new Promise<void>(() => undefined) }, (name, handler) => { handlers.set(name, handler); }, (code) => { exits.push(code); });
    handlers.get("SIGTERM")?.();
    expect(exits).toEqual([]);
    handlers.get("SIGINT")?.();
    expect(exits).toEqual([1]);
  });

  it("still exits when closing fails", async () => {
    const handlers = new Map<string, () => void>();
    const exits: number[] = [];
    closeOnSignals({ close: () => Promise.reject(new Error("busy")) }, (name, handler) => { handlers.set(name, handler); }, (code) => { exits.push(code); });
    handlers.get("SIGTERM")?.();
    await vi.waitFor(() => { expect(exits).toEqual([1]); });
  });
});

it("uses the normal persisted current database and retains explicit path overrides",()=>{expect(parseArgs(["--current-db","/fixture/current.sqlite"],"/fixture").currentDatabase).toBe("/fixture/current.sqlite");expect(parseArgs([],"/fixture").currentDatabase).toBe("/fixture/.viewer-cache/current-v1/current.sqlite");expect(parseArgs(["--runs","/alternate"],"/fixture").currentDatabase).toBe("/alternate/.viewer-cache/current-v1/current.sqlite");for(const args of [["--current-db"],["--current-db",""],["--current-db","/a","--current-db","/b"]])expect(()=>parseArgs(args,"/fixture")).toThrow(CliError);});
it("passes the explicit current database to the server without starting a projector",async()=>{const start=vi.fn().mockResolvedValue({url:"http://127.0.0.1:8790/",port:8790,address:"127.0.0.1",close:async()=>{}});await main(["--current-db","/fixture/current.sqlite"],{repoRunsRoot:"/fixture",defaultEndpoint:null,liveJs:"/fixture/live.js",staticDir:"/s",appDir:"/a",start,print:()=>{}});expect(start).toHaveBeenCalledWith(expect.objectContaining({current:{database:"/fixture/current.sqlite"}}));});
