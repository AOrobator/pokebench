// `just experiments`, `just experiment-approve <id>`, `just experiment-pin <id>`,
// `just experiment-run [--dry-run] [--once]`: the experiment queue from the
// main checkout. Approval is interactive so an agent can never grant it.
import { execFile, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { HUMAN_GAMEPLAY_LEASE_NAME, newRunId } from "@pokebench/agent/run";
import { experimentDir, queueSnapshot, recordedRuns, winnerGateOn, type ExperimentView, type QueuePaths, type RunSource } from "./experiment-store.js";
import { approveExperiment } from "./experiment-approval.js";
import { spawnDetached } from "./detached.js";
import { RunnerError, runQueue, sha256, type DiscoveredModel, type RunnerHost, type TrialLaunch } from "./experiment-runner.js";
import { healthProbe, liveRuns, randomSuffix } from "./next-run.js";

export const EXPERIMENT_GAME_PORT = 8074;
export const GATEWAY = "http://inference.example/v1";

export interface CliDeps {
  readonly paths: QueuePaths;
  readonly source: RunSource;
  readonly host: RunnerHost;
  readonly git: (args: readonly string[]) => string;
  readonly print: (line: string) => void;
  readonly interactive: boolean;
  readonly ask: (question: string) => Promise<string>;
  readonly now: () => Date;
  readonly user: string;
  readonly stopRequested?: () => boolean;
}

const row = (v: ExperimentView): string => `${v.queuePosition === null ? "  -" : String(v.queuePosition).padStart(3)}  ${v.id.padEnd(28)} ${v.state.padEnd(10)} ${v.reason}`;

export async function main(argv: readonly string[], deps: CliDeps): Promise<number> {
  const [command, ...rest] = argv;
  const flags = new Set(rest.filter((a) => a.startsWith("--")));
  const [id] = rest.filter((a) => !a.startsWith("--"));
  const unknown = [...flags].filter((f) => !(command === "run" && (f === "--dry-run" || f === "--once")));
  if (unknown.length > 0) throw new RunnerError(`unknown option ${unknown[0] ?? ""}`);
  const snapshot = (): ReturnType<typeof queueSnapshot> => queueSnapshot(deps.paths, deps.source);
  const find = (views: readonly ExperimentView[]): ExperimentView => {
    if (id === undefined) throw new RunnerError(`${command ?? ""} needs an experiment id`);
    const view = views.find((v) => v.id === id);
    if (view === undefined) throw new RunnerError(`no experiment ${id}`);
    return view;
  };
  switch (command) {
    case "list":
    case "check": {
      const s = snapshot();
      if (command === "list") {
        deps.print("QUEUE");
        for (const v of s.queue) deps.print(row(v));
        deps.print("PENDING (merged behind a switch, not queued)");
        for (const v of s.pending) deps.print(row(v));
        deps.print("CLOSED");
        for (const v of s.closed) deps.print(row(v));
      }
      for (const p of s.problems) deps.print(`problem: ${p}`);
      if (command === "check" && s.problems.length === 0) deps.print(`ok: ${String(s.queue.length + s.pending.length + s.closed.length)} experiments`);
      return s.problems.length === 0 ? 0 : 1;
    }
    case "approve": {
      const s = snapshot(), view = find([...s.queue, ...s.pending, ...s.closed]);
      if (view.state === "pending") throw new RunnerError(`${view.id} is pending (not ready yet); only queued experiments can be approved`);
      if (view.state !== "draft" && view.state !== "stale") throw new RunnerError(`${view.id} is ${view.state}: ${view.reason}`);
      if (!deps.interactive) throw new RunnerError("approval is interactive: run it yourself in a terminal");
      deps.print(`${view.id}: ${view.title}. ${String(view.trialsPerArm * 2)} trials of ${view.changedFeature} ${view.incumbentOn ? "ON vs OFF" : "OFF vs ON"} on ${view.buildCommit === null ? "main as of its first trial" : `main @ ${view.buildCommit.slice(0, 7)}`}; budget ${String(Math.round(view.budgetMs / 3_600_000))} h.`);
      if ((await deps.ask(`Type ${view.id} to approve: `)).trim() !== view.id) throw new RunnerError("not approved");
      approveExperiment(deps.paths, deps.source, view.id, deps.user, deps.now(), deps.git(["rev-parse", "HEAD"]).trim());
      deps.print(`approved ${view.id}; the viewer (or just experiment-run) starts it when it reaches the front of the queue`);
      return 0;
    }
    case "pin": {
      const s = snapshot(), view = find([...s.queue, ...s.pending]);
      if (view.trials.some((t) => t.runs.length > 0)) throw new RunnerError(`${view.id} has started trials; both arms must stay on one build`);
      const head = deps.git(["rev-parse", "HEAD"]).trim();
      const path = join(deps.paths.experimentsDir, `${view.id}.json`);
      const value = JSON.parse(readFileSync(path, "utf8")) as { source: { commit: string } };
      value.source.commit = head;
      writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
      deps.print(`${view.id}: source pinned to ${head}${existsSync(join(experimentDir(deps.paths.runsRoot, view.id), "approval.json")) ? "; its approval is now stale" : ""}`);
      return 0;
    }
    case "run": {
      const outcome = await runQueue({ paths: deps.paths, source: deps.source, host: deps.host, dryRun: flags.has("--dry-run"), once: flags.has("--once"), ...(deps.stopRequested === undefined ? {} : { stopRequested: deps.stopRequested }) });
      deps.print(`${String(outcome.ran)} trial(s) run; ${outcome.stopped}`);
      return 0;
    }
    default:
      throw new RunnerError("usage: experiment-cli list | check | approve <id> | pin <id> | run [--dry-run] [--once]");
  }
}

// The repository's main working tree, where live.js writes runs/ and the definitions live.
export function mainCheckout(from: string, git: (cwd: string, args: readonly string[]) => string): string {
  return dirname(resolve(from, git(from, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim()));
}

export interface HostDeps {
  readonly root: string;
  readonly runsRoot: string;
  readonly git: (args: readonly string[]) => string;
  readonly fetchFn: typeof fetch;
  readonly node: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly log: (line: string) => void;
  // The detached play pid while a trial runs, then null.
  readonly onChild?: (pid: number | null) => void;
  readonly build?: () => Promise<string | null>;
  readonly live?: () => Promise<string[]>;
  readonly pidCommand?: (pid: number) => string | null;
}

// The agent package's own tsc, the same compile `just build` runs for it but emitting nothing on errors;
// resolves to the compiler's errors, or null.
export function buildAgent(root: string, node: string, env: Readonly<Record<string, string | undefined>>): Promise<string | null> {
  const agent = join(root, "packages", "agent");
  return new Promise((resolveBuild) => {
    execFile(node, [join(agent, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.build.json", "--noEmitOnError"], { cwd: agent, env, encoding: "utf8", timeout: 600_000 }, (error, stdout, stderr) => {
      if (error === null) { resolveBuild(null); return; }
      const lines = `${stdout}\n${stderr}`.split("\n").filter((line) => line.trim() !== "").slice(0, 3);
      resolveBuild(lines.length > 0 ? lines.join("; ") : error.message);
    });
  });
}

// INV-Q6: the build that runs is the approved commit, clean, with its own fresh dist.
export function productionHost(deps: HostDeps): RunnerHost {
  const liveJs = join(deps.root, "packages", "agent", "dist", "live.js");
  const live = deps.live ?? (() => liveRuns(deps.runsRoot, healthProbe()));
  const build = deps.build ?? (() => buildAgent(deps.root, deps.node, deps.env));
  // Written only after a clean build, so a failed or interrupted build is never mistaken for a fresh one.
  // It names live.js's mtime too: any other build of this dist (just build, another branch) rewrites live.js and voids it.
  const stamp = join(deps.root, "packages", "agent", "dist", ".build-commit");
  const identity = (head: string): string | null => (existsSync(liveJs) ? `${head} ${String(statSync(liveJs).mtimeMs)}` : null);
  const fresh = (head: string): boolean => existsSync(stamp) && readFileSync(stamp, "utf8").trim() === identity(head);
  return {
    now: () => new Date(),
    runId: (model) => newRunId(new Date(), model, randomSuffix),
    head: () => Promise.resolve(deps.git(["rev-parse", "HEAD"]).trim()),
    verifySource: async (experiment, commit) => {
      const head = deps.git(["rev-parse", "HEAD"]).trim();
      if (head !== commit) return `earlier trials ran on ${commit.slice(0, 7)} but main is at ${head.slice(0, 7)}; both arms must run on one build`;
      if (deps.git(["status", "--porcelain", "--untracked-files=no"]).trim() !== "") return "the main checkout has uncommitted changes";
      if (fresh(head)) return null;
      // A live run or a human session may still be loading modules from this dist.
      const running = await live();
      if (running.length > 0) return `live run ${running[0] ?? ""} is still running; the agent is rebuilt once it ends`;
      const untracked = deps.git(["ls-files", "--others", "--exclude-standard", "--", "packages/agent/src"]).trim();
      if (untracked !== "") return `untracked files would enter the agent build: ${untracked.split("\n").join(", ")}`;
      // Human play takes its own lock, not the gameplay lease; holding it keeps a session from starting mid-build.
      const humanLock = join(deps.runsRoot, HUMAN_GAMEPLAY_LEASE_NAME);
      mkdirSync(deps.runsRoot, { recursive: true });
      try {
        mkdirSync(humanLock);
      } catch {
        return "a human play session is still running; the agent is rebuilt once it ends";
      }
      let failure: string | null;
      try {
        writeFileSync(join(humanLock, "owner.json"), JSON.stringify({ pid: process.pid, owner: "experiment-queue-build" }));
        deps.log(`building the agent for ${head.slice(0, 7)}`);
        rmSync(stamp, { force: true });
        failure = await build();
      } finally {
        rmSync(humanLock, { recursive: true, force: true });
      }
      if (failure !== null) return `the agent build failed: ${failure}`;
      const built = identity(head);
      if (built === null) return "the agent build produced no packages/agent/dist/live.js";
      writeFileSync(stamp, `${built}\n`);
      return null;
    },
    liveRuns: live,
    discover: async (lane): Promise<DiscoveredModel> => {
      const response = await deps.fetchFn(`${GATEWAY}/models`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new RunnerError(`model discovery failed: HTTP ${String(response.status)}`);
      const body = (await response.json()) as { data?: { id?: unknown; metadata?: { observed?: { capabilities?: unknown } } }[] };
      const model = body.data?.find((m) => m.id === lane);
      const capabilities = model?.metadata?.observed?.capabilities;
      if (model === undefined || !Array.isArray(capabilities) || !capabilities.includes("multimodal")) throw new RunnerError(`gateway lists no vision model ${lane}`);
      return { id: lane, fingerprint: sha256(JSON.stringify(model)) };
    },
    launch: (trial: TrialLaunch) => new Promise((resolveExit, reject) => {
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries(deps.env)) if (v !== undefined && k !== "POKEBENCH_ENDPOINT_FILE" && k !== "POKEBENCH_PLAY_PRESET") env[k] = v;
      Object.assign(env, { POKEBENCH_MODEL: trial.model, POKEBENCH_GATEWAY_URL: GATEWAY, POKEBENCH_GAME_SERVER_URL: `http://127.0.0.1:${String(EXPERIMENT_GAME_PORT)}`, POKEBENCH_PLAY_PRESET: trial.presetPath, POKEBENCH_RUN_ID: trial.runId });
      spawnDetached(deps.node, [liveJs, "play"], { cwd: deps.root, env, stdout: trial.stdout, stderr: trial.stderr, started: (pid) => { deps.onChild?.(pid); trial.started?.(pid); } }).then(
        (code) => { deps.onChild?.(null); resolveExit(code); },
        (error: unknown) => { deps.onChild?.(null); reject(error instanceof Error ? error : new Error(String(error))); },
      );
    }),
    log: deps.log,
    activeCohort: () => Promise.resolve(activeCohort(deps.runsRoot, deps.pidCommand ?? pidCommand)),
  };
}

// The command line of a live pid, or null.
export function pidCommand(pid: number): string | null {
  try {
    const out = execFileSync("ps", ["-p", String(pid), "-o", "command="], { encoding: "utf8" }).trim();
    return out === "" ? null : out;
  } catch {
    return null;
  }
}
// A cohort driver or chain under runs/launch-receipts/<name>/ whose recorded pid still runs that
// script. Cohort drivers free the lease between steps; the queue must not take it then.
export function activeCohort(runsRoot: string, command: (pid: number) => string | null): string | null {
  const root = join(runsRoot, "launch-receipts");
  if (!existsSync(root)) return null;
  for (const name of readdirSync(root).sort()) {
    for (const file of ["chain-pid.txt", "driver-pid.txt"]) {
      const path = join(root, name, file);
      if (!existsSync(path)) continue;
      const pid = Number.parseInt(readFileSync(path, "utf8").trim(), 10);
      if (!Number.isInteger(pid) || pid <= 0) continue;
      const line = command(pid);
      if (line !== null && line.includes(join("launch-receipts", name))) return name;
    }
  }
  return null;
}

if (import.meta.main) {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const gitIn = (cwd: string, args: readonly string[]): string => execFileSync("git", [...args], { cwd, encoding: "utf8" });
  const root = mainCheckout(here, gitIn), runsRoot = join(root, "runs");
  const paths: QueuePaths = { experimentsDir: join(root, "experiments"), runsRoot, readinessPath: join(root, "docs", "experiments", "readiness.md"), winnerGate: winnerGateOn(process.env) };
  let child: number | null = null, stop = false;
  // Play is detached, so a terminal Ctrl-C reaches it only through this explicit forward.
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stop = true; if (child !== null) { try { process.kill(child, "SIGINT"); } catch { /* it already exited */ } } });
  const git = (args: readonly string[]): string => gitIn(root, args);
  const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : null;
  main(process.argv.slice(2), {
    paths, source: recordedRuns(runsRoot), git, print: (line) => { console.log(line); },
    host: productionHost({ root, runsRoot, git, fetchFn: fetch, node: process.execPath, env: process.env, log: (line) => { console.log(line); }, onChild: (c) => { child = c; } }),
    interactive: rl !== null, ask: (q) => rl?.question(q) ?? Promise.resolve(""), now: () => new Date(), user: userInfo().username, stopRequested: () => stop,
  }).then((code) => { process.exitCode = code; }, (error: unknown) => {
    console.error(`experiments: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }).finally(() => { rl?.close(); });
}
