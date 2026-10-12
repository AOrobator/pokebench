import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { RUN_ID_PATTERN } from "./events.js";
import { FRAME_CAP_BYTES, FrameStore, START_LIMIT } from "./frames.js";
import { formatBytes } from "./format.js";
import { readRun, summarize, summaryLines } from "./summary.js";

const USAGE = "usage: runs-cli disk | runs-cli prune <percent 0-100> | runs-cli summary [run_id ...]";
const RUN_ID = new RegExp(RUN_ID_PATTERN);

function summaryCommand(ids: readonly string[], runsRoot: string, print: (line: string) => void): number {
  const hasLog = (id: string): boolean => existsSync(join(runsRoot, id, "events.jsonl"));
  for (const id of ids) {
    const problem = !RUN_ID.test(id) ? "invalid run id" : !hasLog(id) ? "no event log for run" : null;
    if (problem !== null) {
      print(`${problem}: ${id}`);
      return 2;
    }
  }
  const listed = existsSync(runsRoot) ? readdirSync(runsRoot) : [];
  const runs = ids.length > 0 ? ids : listed.filter((id) => RUN_ID.test(id) && hasLog(id)).sort();
  if (runs.length === 0) {
    print("no runs with an event log");
    return 0;
  }
  const summaries = runs.map((id) => summarize(readRun(join(runsRoot, id))));
  for (const line of summaryLines(summaries)) print(line);
  return summaries.some((s) => s.reason === "incomplete") ? 1 : 0;
}

function summary(store: FrameStore): string {
  const bytes = store.usage();
  const percent = Math.floor((bytes / store.capBytes) * 100);
  return `frames on disk: ${formatBytes(bytes)} of ${formatBytes(store.capBytes)} cap (${String(percent)}%)`;
}

export function runsCli(argv: readonly string[], runsRoot: string, capBytes: number, print: (line: string) => void): number {
  const [command, arg] = argv;
  if (command === "summary") return summaryCommand(argv.slice(1), runsRoot, print);
  const store = new FrameStore(runsRoot, capBytes, print);
  if (command === "disk" && arg === undefined) {
    print(`${summary(store)}; runs may start at or below ${String(START_LIMIT * 100)}%`);
    return 0;
  }
  const percent = Number(arg);
  if (command === "prune" && arg !== undefined && /^\d+$/.test(arg) && percent <= 100) {
    const freed = store.prune(percent / 100);
    print(`pruned ${String(freed.files)} frames (${formatBytes(freed.bytes)}); ${summary(store)}`);
    return 0;
  }
  print(USAGE);
  return 2;
}

export const RUNS_ROOT = new URL("../../../runs/", import.meta.url).pathname;

export function main(argv: readonly string[], print: (line: string) => void): number {
  return runsCli(argv, RUNS_ROOT, FRAME_CAP_BYTES, print);
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2), (line) => {
    console.log(line);
  });
}
