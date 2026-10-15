import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { definitionHash, parseExperiment, type ReadinessRun } from "@pokebench/agent/experiments";
import { HUMAN_GAMEPLAY_LEASE_NAME } from "@pokebench/agent/run";
import { QUEUE_FEATURES, definition, writeDefinition } from "../test-support/experiments.js";
import { processGroup } from "../test-support/process-group.js";
import { EXPERIMENT_GAME_PORT, GATEWAY, buildAgent, main, mainCheckout, productionHost, type CliDeps } from "./experiment-cli.js";
import { experimentDir, type QueuePaths } from "./experiment-store.js";
import type { RunnerHost } from "./experiment-runner.js";

const READY: ReadinessRun[] = ["r1", "r2", "r3", "r4"].map((id) => ({ id, model: "think-fast", start: "boot", maxTurns: 1500, maxWallMs: 1_800_000, features: QUEUE_FEATURES, reached: ["FIRST_TRUCK_EXIT"] }));
function deps(over: Partial<CliDeps> = {}): CliDeps & { lines: string[]; paths: QueuePaths } {
  const root = mkdtempSync(join(tmpdir(), "pokebench-cli-"));
  const paths = { experimentsDir: join(root, "experiments"), runsRoot: join(root, "runs"), readinessPath: join(root, "readiness.md") };
  mkdirSync(paths.runsRoot, { recursive: true });
  writeDefinition(paths.experimentsDir, definition("full-map"));
  writeDefinition(paths.experimentsDir, definition("pending-one", { queuePosition: undefined, changedFeature: "counter-talk-v1", activationMilestone: "OLDALE_TOWN", primaryMilestone: "ROUTE_103" }));
  const lines: string[] = [];
  const host = { log: (line: string) => { lines.push(line); } } as unknown as RunnerHost;
  return { paths, lines, source: { recent: () => READY, trial: () => null }, host, git: () => `${"b".repeat(40)}\n`, print: (line) => { lines.push(line); }, interactive: true, ask: () => Promise.resolve("full-map"), now: () => new Date("2026-10-14T21:00:00Z"), user: "operator", ...over };
}

describe("experiment queue CLI", () => {
  it("lists the queue, pending and closed entries and checks definitions", async () => {
    const d = deps();
    expect(await main(["list"], d)).toBe(0);
    expect(d.lines[0]).toBe("QUEUE");
    expect(d.lines[1]).toMatch(/^ {2}1 {2}full-map +draft +queued; needs the operator's approval$/);
    expect(d.lines[2]).toBe("PENDING (merged behind a switch, not queued)");
    expect(d.lines[3]).toMatch(/^ {2}- {2}pending-one +pending +not ready: 0 of the last 4/);
    expect(d.lines[4]).toBe("CLOSED");
    expect(await main(["check"], d)).toBe(0);
    expect(d.lines.at(-1)).toBe("ok: 2 experiments");
    writeFileSync(join(d.paths.experimentsDir, "bad.json"), "{");
    expect(await main(["check"], d)).toBe(1);
    expect(d.lines.at(-1)).toMatch(/^problem: bad.json: /);
  });

  it("approves only queued drafts, interactively, with the typed id", async () => {
    const d = deps();
    await expect(main(["approve"], d)).rejects.toThrow("approve needs an experiment id");
    await expect(main(["approve", "nope"], d)).rejects.toThrow("no experiment nope");
    await expect(main(["approve", "pending-one"], { ...d, source: { recent: () => [], trial: () => null } })).rejects.toThrow("pending-one is pending (not ready yet); only queued experiments can be approved");
    await expect(main(["approve", "full-map"], { ...d, interactive: false })).rejects.toThrow("approval is interactive");
    await expect(main(["approve", "full-map"], { ...d, ask: () => Promise.resolve("yes") })).rejects.toThrow("not approved");
    expect(existsSync(join(experimentDir(d.paths.runsRoot, "full-map"), "approval.json"))).toBe(false);
    expect(await main(["approve", "full-map"], d)).toBe(0);
    expect(JSON.parse(readFileSync(join(experimentDir(d.paths.runsRoot, "full-map"), "approval.json"), "utf8"))).toEqual({ experiment: "full-map", sha256: definitionHash(parseExperiment(definition("full-map"))), approvedAt: "2026-10-14T21:00:00.000Z", approvedBy: "operator", commit: "b".repeat(40) });
    await expect(main(["approve", "full-map"], d)).rejects.toThrow("full-map is approved");
  });

  it("pins a definition to main's HEAD unless trials have started", async () => {
    const d = deps();
    expect(await main(["pin", "full-map"], d)).toBe(0);
    expect((JSON.parse(readFileSync(join(d.paths.experimentsDir, "full-map.json"), "utf8")) as { source: { commit: string } }).source.commit).toBe("b".repeat(40));
    expect(d.lines.at(-1)).toBe(`full-map: source pinned to ${"b".repeat(40)}`);
    mkdirSync(experimentDir(d.paths.runsRoot, "full-map"), { recursive: true });
    writeFileSync(join(experimentDir(d.paths.runsRoot, "full-map"), "approval.json"), JSON.stringify({ experiment: "full-map", sha256: "0".repeat(64), approvedAt: "t", approvedBy: "o" }));
    expect(await main(["pin", "full-map"], d)).toBe(0);
    expect(d.lines.at(-1)).toMatch(/its approval is now stale$/);
    writeFileSync(join(experimentDir(d.paths.runsRoot, "full-map"), "trials.jsonl"), JSON.stringify({ type: "launch", trial: 0, arm: "incumbent", run: "a", at: "t" }) + "\n");
    await expect(main(["pin", "full-map"], d)).rejects.toThrow("full-map has started trials");
  });

  it("runs the queue and rejects unknown commands and options", async () => {
    const d = deps();
    expect(await main(["run", "--dry-run"], d)).toBe(0);
    expect(d.lines.at(-1)).toBe("0 trial(s) run; nothing to run: full-map is draft");
    expect(await main(["run"], { ...d, stopRequested: () => true })).toBe(0);
    await expect(main(["run", "--fast"], d)).rejects.toThrow("unknown option --fast");
    await expect(main(["list", "--dry-run"], d)).rejects.toThrow("unknown option --dry-run");
    await expect(main(["frobnicate"], d)).rejects.toThrow(/^usage: /);
    await expect(main([], d)).rejects.toThrow(/^usage: /);
  });
});

describe("production host", () => {
  const git = (cwd: string, args: readonly string[]): string => execFileSync("git", [...args], { cwd, encoding: "utf8" });
  function repo(): { root: string; head: string } {
    const root = mkdtempSync(join(tmpdir(), "pokebench-host-"));
    git(root, ["init", "-q", "-b", "main"]);
    git(root, ["config", "user.email", "t@example.com"]);
    git(root, ["config", "user.name", "t"]);
    writeFileSync(join(root, "tracked.txt"), "one\n");
    git(root, ["add", "tracked.txt"]);
    git(root, ["commit", "-q", "-m", "init"]);
    return { root, head: git(root, ["rev-parse", "HEAD"]).trim() };
  }
  const experiment = (commit: string) => parseExperiment(definition("full-map", { source: { checkout: "main", commit } }));

  it("finds the main checkout from a nested directory", () => {
    const { root } = repo();
    mkdirSync(join(root, "packages", "viewer", "dist"), { recursive: true });
    expect(mainCheckout(join(root, "packages", "viewer", "dist"), git)).toBe(execFileSync("realpath", [root], { encoding: "utf8" }).trim());
  });

  it("verifies the approved commit and a clean tree, and rebuilds an agent build not stamped with that commit", async () => {
    const { root, head } = repo();
    const dist = join(root, "packages", "agent", "dist"), stamp = join(dist, ".build-commit");
    const calls: string[] = [];
    const build = (): Promise<string | null> => {
      calls.push(existsSync(stamp) ? "build over a stamp" : existsSync(join(root, "runs", HUMAN_GAMEPLAY_LEASE_NAME)) ? "build" : "build without holding the human lock");
      mkdirSync(dist, { recursive: true });
      writeFileSync(join(dist, "live.js"), "");
      return Promise.resolve(null);
    };
    const host = productionHost({ root, runsRoot: join(root, "runs"), git: (args) => git(root, args), fetchFn: fetch, node: process.execPath, env: {}, log: (line) => { calls.push(line); }, build });
    expect(await host.head()).toBe(head);
    expect(await host.verifySource(experiment("c".repeat(40)), "c".repeat(40))).toMatch(/^earlier trials ran on ccccccc but main is at [0-9a-f]{7}; both arms must run on one build$/);
    writeFileSync(join(root, "tracked.txt"), "two\n");
    expect(await host.verifySource(experiment(head), head)).toBe("the main checkout has uncommitted changes");
    git(root, ["checkout", "--", "tracked.txt"]);
    expect(calls).toEqual([]);
    expect(await host.verifySource(experiment(head), head)).toBeNull();
    expect(calls).toEqual([`building the agent for ${head.slice(0, 7)}`, "build"]);
    expect(readFileSync(stamp, "utf8")).toBe(`${head} ${String(statSync(join(dist, "live.js")).mtimeMs)}\n`);
    expect(await host.verifySource(experiment(head), head)).toBeNull();
    expect(calls).toHaveLength(2);
    const rebuilt = [`building the agent for ${head.slice(0, 7)}`, "build"];
    // Any other build of dist (just build, a branch checkout's build) rewrites live.js and voids the stamp.
    utimesSync(join(dist, "live.js"), new Date(0), new Date(0));
    expect(await host.verifySource(experiment(head), head)).toBeNull();
    expect(calls).toEqual([...rebuilt, ...rebuilt]);
    writeFileSync(stamp, `${"d".repeat(40)} ${String(statSync(join(dist, "live.js")).mtimeMs)}\n`);
    expect(await host.verifySource(experiment(head), head)).toBeNull();
    expect(calls).toEqual([...rebuilt, ...rebuilt, ...rebuilt]);
    rmSync(join(dist, "live.js"));
    expect(await host.verifySource(experiment(head), head)).toBeNull();
    expect(calls).toEqual([...rebuilt, ...rebuilt, ...rebuilt, ...rebuilt]);
    expect(existsSync(join(root, "runs", HUMAN_GAMEPLAY_LEASE_NAME))).toBe(false);
    rmSync(join(dist, "live.js"));
    await expect(productionHost({ root, runsRoot: join(root, "runs"), git: (args) => git(root, args), fetchFn: fetch, node: process.execPath, env: {}, log: () => undefined, build: () => Promise.reject(new Error("tsc crashed")) }).verifySource(experiment(head), head)).rejects.toThrow("tsc crashed");
    expect(existsSync(join(root, "runs", HUMAN_GAMEPLAY_LEASE_NAME))).toBe(false);
    expect(await host.liveRuns()).toEqual([]);
    expect(host.runId("think-fast")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_think-fast_[0-9a-f]{4}$/);
    expect(host.now()).toBeInstanceOf(Date);
  });

  it("never rebuilds under a live run, and never trusts a failed or empty build", async () => {
    const { root, head } = repo();
    const dist = join(root, "packages", "agent", "dist"), stamp = join(dist, ".build-commit");
    mkdirSync(dist, { recursive: true });
    writeFileSync(stamp, `${"d".repeat(40)}\n`);
    let builds = 0;
    const make = (build: () => Promise<string | null>, running: string[] = []) => productionHost({ root, runsRoot: join(root, "runs"), git: (args) => git(root, args), fetchFn: fetch, node: process.execPath, env: {}, log: () => undefined, build: () => { builds += 1; return build(); }, live: () => Promise.resolve(running) });
    expect(await make(() => Promise.resolve(null), ["run-a"]).verifySource(experiment(head), head)).toBe("live run run-a is still running; the agent is rebuilt once it ends");
    expect(builds).toBe(0);
    expect(await make(() => Promise.resolve(null), ["run-a"]).liveRuns()).toEqual(["run-a"]);
    mkdirSync(join(root, "runs", HUMAN_GAMEPLAY_LEASE_NAME), { recursive: true });
    expect(await make(() => Promise.resolve(null)).verifySource(experiment(head), head)).toBe("a human play session is still running; the agent is rebuilt once it ends");
    rmSync(join(root, "runs", HUMAN_GAMEPLAY_LEASE_NAME), { recursive: true });
    mkdirSync(join(root, "packages", "agent", "src"), { recursive: true });
    writeFileSync(join(root, "packages", "agent", "src", "stray.ts"), "");
    expect(await make(() => Promise.resolve(null)).verifySource(experiment(head), head)).toBe("untracked files would enter the agent build: packages/agent/src/stray.ts");
    rmSync(join(root, "packages", "agent", "src", "stray.ts"));
    expect(builds).toBe(0);
    const failing = make(() => { writeFileSync(join(dist, "live.js"), ""); return Promise.resolve("src/x.ts(1,1): error TS2322"); });
    expect(await failing.verifySource(experiment(head), head)).toBe("the agent build failed: src/x.ts(1,1): error TS2322");
    expect(existsSync(stamp)).toBe(false);
    expect(await failing.verifySource(experiment(head), head)).toBe("the agent build failed: src/x.ts(1,1): error TS2322");
    rmSync(join(dist, "live.js"));
    expect(await make(() => Promise.resolve(null)).verifySource(experiment(head), head)).toBe("the agent build produced no packages/agent/dist/live.js");
    expect(existsSync(stamp)).toBe(false);
    expect(builds).toBe(3);
  });

  it("builds the agent package with its own TypeScript compiler and refuses to emit on errors", async () => {
    const root = mkdtempSync(join(tmpdir(), "pokebench-build-"));
    const bin = join(root, "packages", "agent", "node_modules", "typescript", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "tsc"), "const e=process.env;process.getBuiltinModule('node:fs').writeFileSync('argv.json',JSON.stringify(process.argv.slice(2)));if(e.OUT)console.log(e.OUT);if(e.ERR)console.error(e.ERR);process.exit(e.OUT||e.ERR?2:0)");
    expect(await buildAgent(root, process.execPath, {})).toBeNull();
    expect(JSON.parse(readFileSync(join(root, "packages", "agent", "argv.json"), "utf8"))).toEqual(["-p", "tsconfig.build.json", "--noEmitOnError"]);
    expect(await buildAgent(root, process.execPath, { OUT: "src/a.ts(1,1): error TS1\nsrc/b.ts(2,2): error TS2\nsrc/c.ts(3,3): error TS3\nsrc/d.ts(4,4): error TS4" })).toBe("src/a.ts(1,1): error TS1; src/b.ts(2,2): error TS2; src/c.ts(3,3): error TS3");
    expect(await buildAgent(root, process.execPath, { ERR: "Cannot find module" })).toBe("Cannot find module");
    expect(await buildAgent(root, join(root, "no-such-node"), {})).toMatch(/ENOENT/);
  });

  it("discovers only a vision lane and fingerprints its serving metadata", async () => {
    const reply = (status: number, body: unknown): typeof fetch => (input) => {
      expect(typeof input === "string" ? input : input instanceof URL ? input.href : input.url).toBe(`${GATEWAY}/models`);
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    };
    const make = (fetchFn: typeof fetch) => productionHost({ root: "/", runsRoot: "/", git: () => "", fetchFn, node: process.execPath, env: {}, log: () => undefined });
    const model = { id: "think-fast", metadata: { observed: { capabilities: ["multimodal"] } } };
    expect((await make(reply(200, { data: [model] })).discover("think-fast")).fingerprint).toMatch(/^[0-9a-f]{64}$/);
    await expect(make(reply(500, {})).discover("think-fast")).rejects.toThrow("model discovery failed: HTTP 500");
    await expect(make(reply(200, { data: [{ id: "think-fast", metadata: { observed: { capabilities: ["text"] } } }] })).discover("think-fast")).rejects.toThrow("gateway lists no vision model think-fast");
    await expect(make(reply(200, {})).discover("think-fast")).rejects.toThrow("gateway lists no vision model think-fast");
  });

  it("launches play from the main checkout with the trial's preset, run id and an isolated port", async () => {
    const { root } = repo();
    mkdirSync(join(root, "packages", "agent", "dist"), { recursive: true });
    writeFileSync(join(root, "packages", "agent", "dist", "live.js"), "const e=process.env;require('node:fs').writeFileSync(process.argv[2]+'.env',JSON.stringify({argv:process.argv.slice(2),model:e.POKEBENCH_MODEL,url:e.POKEBENCH_GAME_SERVER_URL,preset:e.POKEBENCH_PLAY_PRESET,run:e.POKEBENCH_RUN_ID,gateway:e.POKEBENCH_GATEWAY_URL,endpoint:e.POKEBENCH_ENDPOINT_FILE??null,keep:e.KEEP}));process.exit(Number(e.EXIT_CODE??0));".replace("process.argv[2]+'.env'", JSON.stringify(join(root, "seen.json"))));
    const children: unknown[] = [];
    const host = productionHost({ root, runsRoot: join(root, "runs"), git: () => "", fetchFn: fetch, node: process.execPath, env: { KEEP: "yes", POKEBENCH_ENDPOINT_FILE: "/x", POKEBENCH_PLAY_PRESET: "/stale", EXIT_CODE: undefined }, log: () => undefined, onChild: (c) => { children.push(c === null ? null : "child"); } });
    const groups: boolean[] = [];
    const code = await host.launch({ runId: "2026-10-14T21-00-00_think-fast_beef", presetPath: "/p/incumbent.json", model: "think-fast", stdout: join(root, "out.log"), stderr: join(root, "err.log"), started: (pid) => { groups.push(processGroup(pid) === String(pid)); } });
    expect(code).toBe(0);
    expect(groups).toEqual([true]);
    expect(JSON.parse(readFileSync(join(root, "seen.json"), "utf8"))).toEqual({ argv: ["play"], model: "think-fast", url: `http://127.0.0.1:${String(EXPERIMENT_GAME_PORT)}`, preset: "/p/incumbent.json", run: "2026-10-14T21-00-00_think-fast_beef", gateway: GATEWAY, endpoint: null, keep: "yes" });
    expect(children).toEqual(["child", null]);
    const failing = productionHost({ root, runsRoot: join(root, "runs"), git: () => "", fetchFn: fetch, node: join(root, "no-such-node"), env: {}, log: () => undefined });
    await expect(failing.launch({ runId: "r", presetPath: "/p", model: "m", stdout: join(root, "o2.log"), stderr: join(root, "e2.log") })).rejects.toThrow();
  });
});
