// `just experiments`, `just experiment-approve <id>`, `just experiment-pin <id>`,
// `just experiment-run [--dry-run] [--once]`: the experiment queue from the
// main checkout. Approval is interactive so an agent can never grant it.
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, openSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { newRunId } from "@pokebench/agent/run";
import { experimentDir, queueSnapshot, recordedRuns, type ExperimentView, type QueuePaths, type RunSource } from "./experiment-store.js";
import { approveExperiment } from "./experiment-approval.js";
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
  readonly onChild?: (child: ChildProcess | null) => void;
}

// INV-Q6: the build that runs is the approved commit, clean, with its own fresh dist.
export function productionHost(deps: HostDeps): RunnerHost {
  const liveJs = join(deps.root, "packages", "agent", "dist", "live.js");
  return {
    now: () => new Date(),
    runId: (model) => newRunId(new Date(), model, randomSuffix),
    head: () => Promise.resolve(deps.git(["rev-parse", "HEAD"]).trim()),
    verifySource: (experiment, commit) => {
      const head = deps.git(["rev-parse", "HEAD"]).trim();
      if (head !== commit) return Promise.resolve(`earlier trials ran on ${commit.slice(0, 7)} but main is at ${head.slice(0, 7)}; both arms must run on one build`);
      if (deps.git(["status", "--porcelain", "--untracked-files=no"]).trim() !== "") return Promise.resolve("the main checkout has uncommitted changes");
      if (!existsSync(liveJs)) return Promise.resolve("packages/agent/dist/live.js is missing; run just build");
      const committed = Number(deps.git(["log", "-1", "--format=%ct", head]).trim()) * 1000;
      if (statSync(liveJs).mtimeMs < committed) return Promise.resolve("the agent build is older than the approved commit; run just build");
      return Promise.resolve(null);
    },
    liveRuns: () => liveRuns(deps.runsRoot, healthProbe()),
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
      const out = openSync(trial.stdout, "wx", 0o600), err = openSync(trial.stderr, "wx", 0o600);
      const child = spawn(deps.node, [liveJs, "play"], { cwd: deps.root, env, stdio: ["ignore", out, err] });
      closeSync(out);
      closeSync(err);
      deps.onChild?.(child);
      child.once("error", (error) => { deps.onChild?.(null); reject(error); });
      child.once("exit", (code) => { deps.onChild?.(null); resolveExit(code); });
    }),
    log: deps.log,
  };
}

if (import.meta.main) {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const gitIn = (cwd: string, args: readonly string[]): string => execFileSync("git", [...args], { cwd, encoding: "utf8" });
  const root = mainCheckout(here, gitIn), runsRoot = join(root, "runs");
  const paths: QueuePaths = { experimentsDir: join(root, "experiments"), runsRoot, readinessPath: join(root, "docs", "experiments", "readiness.md") };
  let child: ChildProcess | null = null, stop = false;
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stop = true; child?.kill("SIGINT"); });
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
