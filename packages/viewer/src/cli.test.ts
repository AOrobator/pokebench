import { describe, expect, it, vi } from "vitest";
import { CliError, DEFAULT_PORT, main, parseArgs, viewUrl } from "./cli.js";
import { RunQueue } from "./next-run.js";

describe("parseArgs", () => {
  it("defaults to the repo's runs/ on port 8790 with no run", () => {
    expect(parseArgs([], "/repo/runs")).toEqual({ runId: null, port: DEFAULT_PORT, runsRoot: "/repo/runs", endpointFile: null, publicOrigins: [] });
    expect(parseArgs(["--endpoint-file", "/e.json"], "/r", "/default.json").endpointFile).toBe("/e.json");
    expect(parseArgs([], "/r", "/default.json").endpointFile).toBe("/default.json");
    expect(DEFAULT_PORT).toBe(8790);
  });

  it("takes a run id, a port and a runs directory", () => {
    expect(parseArgs(["2026-10-11T22-16-26_think-swarm_890b", "--port", "9001", "--runs", "/other/runs"], "/repo/runs")).toEqual({
      runId: "2026-10-11T22-16-26_think-swarm_890b",
      port: 9001,
      runsRoot: "/other/runs",
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
    expect(start).toHaveBeenCalledWith({ runsRoot: "/x/runs", staticDir: "/s", appDir: "/a", port: 8790, endpointFile: "/e.json", publicOrigins: [], queue: expect.any(RunQueue) as unknown, restartHuman: expect.any(Function) as unknown });
    expect(lines).toEqual(["PokeBench viewer: http://127.0.0.1:8790/#run=abc", "runs: /x/runs (Ctrl-C to stop)", "next runs: local models from /e.json"]);
    await main(["--runs", "/x/runs"], { repoRunsRoot: "/repo/runs", defaultEndpoint: null, liveJs: "/l.js", staticDir: "/s", appDir: "/a", start, print: (line) => lines.push(line) });
    expect(lines.at(-1)).toBe("next runs: no local model endpoint file; queueing is disabled");
  });

  it("prints each public origin with the run in the hash", async () => {
    const start = vi.fn().mockResolvedValue({ url: "http://127.0.0.1:8790/", port: 8790, address: "127.0.0.1", close: () => Promise.resolve() });
    const lines: string[] = [];
    await main(["abc"], { repoRunsRoot: "/repo/runs", defaultEndpoint: null, defaultPublicOrigins: "https://studio.example.ts.net:8447", liveJs: "/l.js", staticDir: "/s", appDir: "/a", start, print: (line) => lines.push(line) });
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ publicOrigins: ["https://studio.example.ts.net:8447"] }));
    expect(lines.slice(0, 2)).toEqual(["PokeBench viewer: http://127.0.0.1:8790/#run=abc", "also published at: https://studio.example.ts.net:8447/#run=abc"]);
  });
});
