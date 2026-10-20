import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { checkEvent, RUN_ID_PATTERN } from "./events.js";
import { recoveryCollector, recoveryLines } from "./loop-recovery.js";
import { locateRunDir } from "./run.js";
import { RUNS_ROOT } from "./runs-cli.js";

const USAGE = "usage: loop-recovery [--runs-root DIR] <run_id> [...]";
const RUN_ID = new RegExp(RUN_ID_PATTERN);

// Streams each run's events.jsonl line by line (logs can exceed what one string holds) and prints its recovery table.
export async function loopRecoveryCli(argv: readonly string[], defaultRoot: string, print: (line: string) => void): Promise<number> {
  const rooted = argv[0] === "--runs-root";
  const runsRoot = rooted ? argv[1] ?? "" : defaultRoot;
  const ids = rooted ? argv.slice(2) : argv;
  if (ids.length === 0 || runsRoot === "") { print(USAGE); return 2; }
  for (const id of ids) {
    const file = RUN_ID.test(id) ? join(locateRunDir(runsRoot, id), "events.jsonl") : null;
    if (file === null || !existsSync(file)) { print(`${file === null ? "invalid run id" : "no event log for run"}: ${id}`); return 2; }
    const collector = recoveryCollector();
    for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (line.trim() !== "") collector.observe(checkEvent(JSON.parse(line)));
    }
    const { interventions, rates } = collector.result();
    print(`${id}: ${String(interventions.length)} interventions`);
    for (const row of recoveryLines(rates)) print(row);
  }
  return 0;
}

/* v8 ignore start -- the entrypoint */
if (import.meta.main) {
  process.exitCode = await loopRecoveryCli(process.argv.slice(2), RUNS_ROOT, (line) => { console.log(line); });
}
/* v8 ignore stop */
