import { describe, expect, it, vi } from "vitest";
import { CliError, DEFAULT_PORT, main, parseArgs, viewUrl } from "./cli.js";
import { RunQueue } from "./next-run.js";

describe("parseArgs", () => {
  it("defaults to the repo's runs/ on port 8790 with no run", () => {
    expect(parseArgs([], "/repo/runs")).toEqual({ runId: null, port: DEFAULT_PORT, runsRoot: "/repo/runs", endpointFile: null });
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
  ])("rejects %j", (argv) => {
    expect(() => parseArgs(argv, "/r")).toThrow(CliError);
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
    expect(start).toHaveBeenCalledWith({ runsRoot: "/x/runs", staticDir: "/s", appDir: "/a", port: 8790, endpointFile: "/e.json", queue: expect.any(RunQueue) as unknown, restartHuman: expect.any(Function) as unknown });
    expect(lines).toEqual(["PokeBench viewer: http://127.0.0.1:8790/#run=abc", "runs: /x/runs (Ctrl-C to stop)", "next runs: local models from /e.json"]);
    await main(["--runs", "/x/runs"], { repoRunsRoot: "/repo/runs", defaultEndpoint: null, liveJs: "/l.js", staticDir: "/s", appDir: "/a", start, print: (line) => lines.push(line) });
    expect(lines.at(-1)).toBe("next runs: no local model endpoint file; queueing is disabled");
  });
});
