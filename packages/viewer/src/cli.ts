// `just view [id]`: serve the viewer on 127.0.0.1 and print where to look.
import { execFileSync } from "node:child_process";
import { humanLeasePath } from "@pokebench/agent/run";
import { fileURLToPath } from "node:url";
import { RUN_ID_PATTERN } from "@pokebench/agent/events";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
}

export function parseArgs(argv: readonly string[], defaultRunsRoot: string, defaultEndpoint: string | null = null): CliArgs {
  let runId: string | null = null;
  let port = DEFAULT_PORT;
  let runsRoot = defaultRunsRoot;
  let endpointFile = defaultEndpoint;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--port" || arg === "--runs" || arg === "--endpoint-file") {
      const value = argv[i + 1];
      if (value === undefined) throw new CliError(`${arg} needs a value`);
      i += 1;
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
  return { runId, port, runsRoot, endpointFile };
}

export function viewUrl(base: string, runId: string | null): string {
  return runId === null ? base : `${base}#run=${encodeURIComponent(runId)}`;
}

export interface MainDeps {
  readonly repoRunsRoot: string;
  readonly defaultEndpoint: string | null;
  readonly liveJs: string;
  readonly staticDir: string;
  readonly appDir: string;
  readonly start: (options: ViewerOptions) => Promise<Viewer>;
  readonly print: (line: string) => void;
  readonly humanLeasePath?: string;
}

export async function main(argv: readonly string[], deps: MainDeps): Promise<Viewer> {
  const args = parseArgs(argv, deps.repoRunsRoot, deps.defaultEndpoint);
  const queue = new RunQueue({ runsRoot: args.runsRoot, liveJs: deps.liveJs, endpointFile: args.endpointFile, gamePort: QUEUE_GAME_PORT, healthy: healthProbe(), now: () => new Date(), random: randomSuffix, launch: (spec) => spawnLaunch(spec) });
  const restarts = new HumanRestarts({runsRoot:args.runsRoot,liveJs:deps.liveJs,healthy:healthProbe(),now:()=>new Date(),random:randomSuffix,launch:spec=>spawnLaunch(spec),...(deps.humanLeasePath===undefined?{}:{leasePath:deps.humanLeasePath})});
  const viewer = await deps.start({ runsRoot: args.runsRoot, staticDir: deps.staticDir, appDir: deps.appDir, port: args.port, endpointFile: args.endpointFile, queue, restartHuman:id=>restarts.restart(id) });
  deps.print(`PokeBench viewer: ${viewUrl(viewer.url, args.runId)}`);
  deps.print(`runs: ${args.runsRoot} (Ctrl-C to stop)`);
  deps.print(args.endpointFile === null ? "next runs: no local model endpoint file; queueing is disabled" : `next runs: local models from ${args.endpointFile}`);
  return viewer;
}

if (import.meta.main) {
  const here = (path: string): string => fileURLToPath(new URL(path, import.meta.url));
  main(process.argv.slice(2), {
    repoRunsRoot: here("../../../runs"),
    humanLeasePath: humanLeasePath(here("../../../"), execFileSync("git", ["rev-parse", "--git-common-dir"], {cwd:here("../../../"),encoding:"utf8"}).trim()),
    defaultEndpoint: process.env["POKEBENCH_ENDPOINT_FILE"] ?? (existsSync(HERMES_ENDPOINT) ? HERMES_ENDPOINT : null),
    liveJs: here("../../agent/dist/live.js"),
    staticDir: here("../static"),
    appDir: here("./"),
    start: startViewer,
    print: (line) => {
      console.log(line);
    },
  }).catch((error: unknown) => {
    console.error(`view FAILED: ${String(error)}`);
    process.exitCode = 1;
  });
}
