// `just view [id]`: serve the viewer on 127.0.0.1 and print where to look.
import { execFileSync } from "node:child_process";
import { humanLeasePath } from "@pokebench/agent/run";
import { fileURLToPath } from "node:url";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";
import { existsSync } from "node:fs";
import { availableParallelism, homedir } from "node:os";
import { Worker } from "node:worker_threads";
import { createBaselinePool, defaultPoolSize } from "./baseline-pool.js";
import { baselineCacheDir, codeIdentity, createBaselineStore, createWorkbenchStore, pruneBaselineCaches, workbenchCacheDir } from "./baseline-store.js";
import { dirname, join } from "node:path";
import { ExperimentAutoRun } from "./experiment-autorun.js";
import { winnerGateOn } from "./experiment-store.js";
import { productionHost } from "./experiment-cli.js";
import { recordedRuns } from "./experiment-store.js";
import { HumanRestarts, RunQueue, healthProbe, randomSuffix, spawnLaunch } from "./next-run.js";
import { startViewer, type Viewer, type ViewerOptions } from "./server.js";

export const DEFAULT_PORT = 8790;
// Game server port for runs the viewer queues (comparison cohorts use 8070).
export const QUEUE_GAME_PORT = 8076;
// Hermes's local llama-server router writes this endpoint file.
export const HERMES_ENDPOINT = join(homedir(), ".hermes", "runtimes", "llamacpp", "server.json");
const RUN_ID = new RegExp(RUN_ID_PATTERN);

export class CliError extends Error {
  override readonly name = "CliError";
}

export interface CliArgs {
  readonly runId: string | null;
  readonly port: number;
  readonly runsRoot: string;
  readonly endpointFile: string | null;
  readonly publicOrigins: readonly string[];
}

// An origin a loopback proxy publishes the viewer at (Tailscale Serve https, Mac-edge LAN http): no path, no credentials.
function publicOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CliError(`not a public origin: ${value}`);
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new CliError(`a public origin is http(s)://host[:port] only, got ${value}`);
  }
  return url.origin;
}

export function parseArgs(argv: readonly string[], defaultRunsRoot: string, defaultEndpoint: string | null = null, defaultPublicOrigins = ""): CliArgs {
  let runId: string | null = null;
  let port = DEFAULT_PORT;
  let runsRoot = defaultRunsRoot;
  let endpointFile = defaultEndpoint;
  const flagOrigins: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--port" || arg === "--runs" || arg === "--endpoint-file" || arg === "--public-origin") {
      const value = argv[i + 1];
      if (value === undefined) throw new CliError(`${arg} needs a value`);
      i += 1;
      if (arg === "--public-origin") {
        flagOrigins.push(publicOrigin(value));
        continue;
      }
      if (arg === "--endpoint-file") {
        endpointFile = value;
        continue;
      }
      if (arg === "--runs") {
        runsRoot = value;
        continue;
      }
      port = Number(value);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new CliError(`--port must be 1024–65535, got ${value}`);
    } else if (arg.startsWith("--")) {
      throw new CliError(`unknown option ${arg} (the viewer always binds 127.0.0.1)`);
    } else if (arg !== "") {
      if (runId !== null) throw new CliError("at most one run id");
      if (!RUN_ID.test(arg)) throw new CliError(`not a run id: ${arg}`);
      runId = arg;
    }
  }
  const envOrigins = defaultPublicOrigins.split(",").map((value) => value.trim()).filter((value) => value !== "");
  const publicOrigins = flagOrigins.length > 0 ? flagOrigins : envOrigins.map(publicOrigin);
  return { runId, port, runsRoot, endpointFile, publicOrigins };
}

export function viewUrl(base: string, runId: string | null): string {
  return runId === null ? base : `${base}#run=${encodeURIComponent(runId)}`;
}

export interface MainDeps {
  readonly repoRunsRoot: string;
  readonly defaultEndpoint: string | null;
  readonly defaultPublicOrigins?: string;
  readonly liveJs: string;
  readonly staticDir: string;
  readonly appDir: string;
  readonly start: (options: ViewerOptions) => Promise<Viewer>;
  readonly print: (line: string) => void;
  readonly humanLeasePath?: string;
  // Builds the experiment queue runner for this runs directory (absent in tests).
  readonly autorun?: (runsRoot: string) => ExperimentAutoRun;
  // Where run logs are reduced for this runs directory: comparison baselines and workbench runs (absent: in process).
  readonly offload?: (runsRoot: string) => Pick<ViewerOptions, "baselines" | "workbench">;
}

export async function main(argv: readonly string[], deps: MainDeps): Promise<Viewer> {
  const args = parseArgs(argv, deps.repoRunsRoot, deps.defaultEndpoint, deps.defaultPublicOrigins);
  const queue = new RunQueue({ runsRoot: args.runsRoot, liveJs: deps.liveJs, endpointFile: args.endpointFile, gamePort: QUEUE_GAME_PORT, healthy: healthProbe(), now: () => new Date(), random: randomSuffix, launch: (spec) => spawnLaunch(spec) });
  const restarts = new HumanRestarts({runsRoot:args.runsRoot,liveJs:deps.liveJs,healthy:healthProbe(),now:()=>new Date(),random:randomSuffix,launch:spec=>spawnLaunch(spec),...(deps.humanLeasePath===undefined?{}:{leasePath:deps.humanLeasePath})});
  const autorun = deps.autorun?.(args.runsRoot);
  const offload = deps.offload?.(args.runsRoot);
  const viewer = await deps.start({ runsRoot: args.runsRoot, staticDir: deps.staticDir, appDir: deps.appDir, port: args.port, endpointFile: args.endpointFile, publicOrigins: args.publicOrigins, queue, restartHuman:id=>restarts.restart(id), ...(autorun === undefined ? {} : { autorun }), ...offload });
  deps.print(`PokeBench viewer: ${viewUrl(viewer.url, args.runId)}`);
  for (const origin of args.publicOrigins) deps.print(`also published at: ${viewUrl(`${origin}/`, args.runId)}`);
  deps.print(`runs: ${args.runsRoot} (Ctrl-C to stop)`);
  deps.print(args.endpointFile === null ? "next runs: no local model endpoint file; queueing is disabled" : `next runs: local models from ${args.endpointFile}`);
  return viewer;
}

// A deploy stops the viewer with SIGTERM, a terminal with SIGINT. Runs are detached and
// a restarted viewer adopts them, so shutdown only closes the server and the autorun.
export function closeOnSignals(viewer: Pick<Viewer, "close">, on: (signal: "SIGTERM" | "SIGINT", handler: () => void) => void, exit: (code: number) => void): void {
  let closing = false;
  const shutdown = (): void => {
    // A second signal means the operator won't wait for a hung close.
    if (closing) { exit(1); return; }
    closing = true;
    viewer.close().then(() => { exit(0); }, () => { exit(1); });
  };
  on("SIGTERM", shutdown);
  on("SIGINT", shutdown);
}

if (import.meta.main) {
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  main(process.argv.slice(2), {
    repoRunsRoot: here("../../../runs"),
    humanLeasePath: humanLeasePath(here("../../../"), execFileSync("git", ["rev-parse", "--git-common-dir"], {cwd:here("../../../"),encoding:"utf8"}).trim()),
    defaultEndpoint: process.env["POKEBENCH_ENDPOINT_FILE"] ?? (existsSync(HERMES_ENDPOINT) ? HERMES_ENDPOINT : null),
    defaultPublicOrigins: process.env["POKEBENCH_VIEWER_ORIGINS"] ?? "",
    liveJs: here("../../agent/dist/live.js"),
    staticDir: here("../static"),
    appDir: here("./"),
    start: startViewer,
    // The repository that owns runsRoot runs approved experiments from its own build.
    autorun: (runsRoot) => {
      const root = dirname(runsRoot), git = (args: readonly string[]): string => execFileSync("git", [...args], { cwd: root, encoding: "utf8" });
      const paths = { experimentsDir: join(root, "experiments"), runsRoot, readinessPath: join(root, "docs", "experiments", "readiness.md"), winnerGate: winnerGateOn(process.env) };
      const source = recordedRuns(runsRoot);
      return new ExperimentAutoRun({ paths, source, now: () => Date.now(), host: productionHost({ root, runsRoot, git, fetchFn: fetch, node: process.execPath, env: process.env, log: (line) => { console.log(`experiments: ${line}`); } }) });
    },
    // Run logs reduce on worker threads; results persist per code identity beside the runs.
    offload: (runsRoot) => {
      const worker = new URL("./baseline-worker.js", import.meta.url), codeId = codeIdentity(fileURLToPath(worker));
      pruneBaselineCaches(runsRoot, codeId, Date.now());
      const pool = createBaselinePool(() => new Worker(worker), defaultPoolSize(availableParallelism()));
      return {
        baselines: { compute: pool.compute, store: createBaselineStore(baselineCacheDir(runsRoot, codeId)), warm: true, close: () => pool.close() },
        workbench: { compute: pool.load, store: createWorkbenchStore(workbenchCacheDir(runsRoot, codeId)), partial: true },
      };
    },
    print: (line) => {
      console.log(line);
    },
  }).then((viewer) => {
    closeOnSignals(viewer, (signal, handler) => { process.on(signal, handler); }, (code) => { process.exit(code); });
  }, (error: unknown) => {
    console.error(`view FAILED: ${String(error)}`);
    process.exitCode = 1;
  });
}
