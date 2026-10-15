import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { definitionHash, parseExperiment, type ReadinessRun } from "@pokebench/agent/experiments";
import { QUEUE_FEATURES, definition, writeDefinition } from "../test-support/experiments.js";
import { EXPERIMENT_GAME_PORT, GATEWAY, main, mainCheckout, productionHost, type CliDeps } from "./experiment-cli.js";
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

  it("verifies the approved commit, a clean tree and a fresh build", async () => {
    const { root, head } = repo();
    const host = productionHost({ root, runsRoot: join(root, "runs"), git: (args) => git(root, args), fetchFn: fetch, node: process.execPath, env: {}, log: () => undefined });
    expect(await host.verifySource(experiment("c".repeat(40)), "c".repeat(40))).toMatch(/^main is at [0-9a-f]{7}, not the approved ccccccc; withdraw its approval and approve it again on the current build$/);
    writeFileSync(join(root, "tracked.txt"), "two\n");
    expect(await host.verifySource(experiment(head), head)).toBe("the main checkout has uncommitted changes");
    git(root, ["checkout", "--", "tracked.txt"]);
    expect(await host.verifySource(experiment(head), head)).toBe("packages/agent/dist/live.js is missing; run just build");
    const live = join(root, "packages", "agent", "dist", "live.js");
    mkdirSync(join(root, "packages", "agent", "dist"), { recursive: true });
    writeFileSync(live, "");
    utimesSync(live, new Date(0), new Date(0));
    expect(await host.verifySource(experiment(head), head)).toBe("the agent build is older than the approved commit; run just build");
    utimesSync(live, new Date(), new Date());
    expect(await host.verifySource(experiment(head), head)).toBeNull();
    expect(await host.liveRuns()).toEqual([]);
    expect(host.runId("think-fast")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}_think-fast_[0-9a-f]{4}$/);
    expect(host.now()).toBeInstanceOf(Date);
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
    const code = await host.launch({ runId: "2026-10-14T21-00-00_think-fast_beef", presetPath: "/p/incumbent.json", model: "think-fast", stdout: join(root, "out.log"), stderr: join(root, "err.log") });
    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(join(root, "seen.json"), "utf8"))).toEqual({ argv: ["play"], model: "think-fast", url: `http://127.0.0.1:${String(EXPERIMENT_GAME_PORT)}`, preset: "/p/incumbent.json", run: "2026-10-14T21-00-00_think-fast_beef", gateway: GATEWAY, endpoint: null, keep: "yes" });
    expect(children).toEqual(["child", null]);
    const failing = productionHost({ root, runsRoot: join(root, "runs"), git: () => "", fetchFn: fetch, node: join(root, "no-such-node"), env: {}, log: () => undefined });
    await expect(failing.launch({ runId: "r", presetPath: "/p", model: "m", stdout: join(root, "o2.log"), stderr: join(root, "e2.log") })).rejects.toThrow();
  });
});
