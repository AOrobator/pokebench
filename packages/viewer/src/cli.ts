// `just view [id]`: serve the viewer on 127.0.0.1 and print where to look.
import { execFileSync } from "node:child_process";
import { humanLeasePath } from "@pokebench/agent/run";
import { fileURLToPath } from "node:url";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { createBaselinePool, defaultPoolSize, type BaselineWorkerLike } from "./baseline-pool.js";
import { baselineCacheDir, codeIdentity, createBaselineStore, createWorkbenchStore, pruneBaselineCaches, workbenchCacheDir } from "./baseline-store.js";
import { join, resolve } from "node:path";
import { HumanRestarts, RunQueue, endpointFromEnv, healthProbe, nextRunsLine, randomSuffix, spawnLaunch } from "./next-run.js";
import { leasePool } from "./lease.js";
import { readEndpoint } from "@pokebench/agent/local-endpoint";
import { startViewer, type Viewer, type ViewerOptions } from "./server.js";
import { isMain } from "@pokebench/agent/is-main";

export const DEFAULT_PORT = 8790;
// Game server port for runs the viewer queues (comparison cohorts use 8070).
export const QUEUE_GAME_PORT = 8076;
const RUN_ID = new RegExp(RUN_ID_PATTERN);

export class CliError extends Error {
  override readonly name = "CliError";
}

export interface CliArgs {
  readonly currentDatabase: string;
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
  let currentDatabase:string|undefined;
  let runId: string | null = null;
  let port = DEFAULT_PORT;
  let runsRoot = defaultRunsRoot;
  let endpointFile = defaultEndpoint;
  const flagOrigins: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--current-db" || arg === "--port" || arg === "--runs" || arg === "--endpoint-file" || arg === "--public-origin") {
      const value = argv[i + 1];
      if (value === undefined) throw new CliError(`${arg} needs a value`);
      i += 1;
      if (arg === "--current-db") {
        if(currentDatabase!==undefined||value.trim()==="")throw new CliError("--current-db needs one nonempty database path");
        currentDatabase=resolve(value);continue;
      }
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
  return { runId, port, runsRoot, endpointFile, publicOrigins, currentDatabase: currentDatabase ?? join(resolve(runsRoot), ".viewer-cache", "current-v1", "current.sqlite") };
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
  // Where run logs are reduced for this runs directory: comparison baselines and workbench runs (absent: in process).
  readonly offload?: (runsRoot: string) => Pick<ViewerOptions, "baselines" | "workbench">;
}

// Cold caches are reduced only when a page asks for them. Eagerly warming every historical log
// after each viewer build can saturate several cores for minutes and starve live emulators.
export function viewerOffload(
  runsRoot: string,
  worker: URL,
  codeId: string,
  parallelism: number,
  spawn: () => BaselineWorkerLike = () => new Worker(worker),
): Pick<ViewerOptions, "baselines" | "workbench"> {
  pruneBaselineCaches(runsRoot, codeId, Date.now());
  const pool = createBaselinePool(spawn, defaultPoolSize(parallelism));
  return {
    baselines: { compute: pool.compute, store: createBaselineStore(baselineCacheDir(runsRoot, codeId)), close: () => pool.close() },
    workbench: { compute: pool.load, prioritize: ids => { pool.prioritize(runsRoot, ids); }, store: createWorkbenchStore(workbenchCacheDir(runsRoot, codeId)), partial: true },
  };
}

// Outside the per-build cache directories, so a new build answers from the last ranking while it ranks again.
export const frontierCacheFile = (runsRoot: string): string => join(runsRoot, ".viewer-cache", "frontier-v1.json");

export async function main(argv: readonly string[], deps: MainDeps): Promise<Viewer> {
  const args = parseArgs(argv, deps.repoRunsRoot, deps.defaultEndpoint, deps.defaultPublicOrigins);
  const queue = new RunQueue({ runsRoot: args.runsRoot, liveJs: deps.liveJs, endpointFile: args.endpointFile, leasePool: () => leasePool(readEndpoint(args.endpointFile ?? "").baseUrl), gamePort: QUEUE_GAME_PORT, healthy: healthProbe(), now: () => new Date(), random: randomSuffix, launch: (spec) => spawnLaunch(spec) });
  const restarts = new HumanRestarts({runsRoot:args.runsRoot,liveJs:deps.liveJs,healthy:healthProbe(),now:()=>new Date(),random:randomSuffix,launch:spec=>spawnLaunch(spec),...(deps.humanLeasePath===undefined?{}:{leasePath:deps.humanLeasePath})});
  const offload = deps.offload?.(args.runsRoot);
  const viewer = await deps.start({ runsRoot: args.runsRoot, staticDir: deps.staticDir, appDir: deps.appDir, port: args.port, endpointFile: args.endpointFile, publicOrigins: args.publicOrigins, queue, restartHuman:id=>restarts.restart(id), frontier: { file: frontierCacheFile(args.runsRoot), warm: true }, ...offload, current:{database:args.currentDatabase} });
  deps.print(`PokeBench viewer: ${viewUrl(viewer.url, args.runId)}`);
  for (const origin of args.publicOrigins) deps.print(`also published at: ${viewUrl(`${origin}/`, args.runId)}`);
  deps.print(`runs: ${args.runsRoot} (Ctrl-C to stop)`);
  deps.print(nextRunsLine(args.endpointFile));
  return viewer;
}

// A deploy stops the viewer with SIGTERM, a terminal with SIGINT. Runs are detached and
// a restarted viewer adopts them, so shutdown only closes the server.
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

if (isMain(import.meta)) {
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  main(process.argv.slice(2), {
    repoRunsRoot: here("../../../runs"),
    humanLeasePath: humanLeasePath(here("../../../"), execFileSync("git", ["rev-parse", "--git-common-dir"], {cwd:here("../../../"),encoding:"utf8"}).trim()),
    defaultEndpoint: endpointFromEnv(process.env),
    defaultPublicOrigins: process.env["POKEBENCH_VIEWER_ORIGINS"] ?? "",
    liveJs: here("../../agent/dist/live.js"),
    staticDir: here("../static"),
    appDir: here("./"),
    start: startViewer,
    // Run logs reduce on worker threads; results persist per code identity beside the runs.
    offload: (runsRoot) => {
      const worker = new URL("./baseline-worker.js", import.meta.url), codeId = codeIdentity(fileURLToPath(worker));
      return viewerOffload(runsRoot, worker, codeId, availableParallelism());
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
