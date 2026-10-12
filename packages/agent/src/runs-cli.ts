import { FRAME_CAP_BYTES, FrameStore, START_LIMIT } from "./frames.js";
import { formatBytes } from "./format.js";

const USAGE = "usage: runs-cli disk | runs-cli prune <percent 0-100>";

function summary(store: FrameStore): string {
  const bytes = store.usage();
  const percent = Math.floor((bytes / store.capBytes) * 100);
  return `frames on disk: ${formatBytes(bytes)} of ${formatBytes(store.capBytes)} cap (${String(percent)}%)`;
}

export function runsCli(argv: readonly string[], runsRoot: string, capBytes: number, print: (line: string) => void): number {
  const store = new FrameStore(runsRoot, capBytes, print);
  const [command, arg] = argv;
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
