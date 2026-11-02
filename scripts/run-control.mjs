#!/usr/bin/env node
// Ask a live run to change course without signalling it: the agent polls runs/<id>/control.jsonl.
//   pause | resume | stop | cancel_stop | abort
// `stop` ends after the current turn and still scores; `abort` ends now and still keeps earned progress.
import {appendFileSync, existsSync, readFileSync} from "node:fs";
import {join} from "node:path";
import {CONTROL_ACTIONS} from "../packages/agent/dist/events.js";
import {controlLine} from "../packages/agent/dist/run-control.js";

const runsRoot = process.env.POKEBENCH_RUNS_ROOT ?? new URL("../runs", import.meta.url).pathname;
const [id, action] = process.argv.slice(2);

if (id === undefined || action === undefined) {
  console.error(`usage: run-control.mjs <run-id> <${CONTROL_ACTIONS.join("|")}>`);
  process.exit(2);
}
if (!CONTROL_ACTIONS.includes(action)) {
  console.error(`unknown action ${action}; one of ${CONTROL_ACTIONS.join(", ")}`);
  process.exit(2);
}

const dir = [join(runsRoot, id), join(runsRoot, "human", id)].find((path) => existsSync(path));
if (dir === undefined) {
  console.error(`no run directory for ${id}`);
  process.exit(1);
}

const path = join(dir, "control.jsonl");
const seq = existsSync(path) ? readFileSync(path, "utf8").split("\n").filter((line) => line.trim() !== "").length + 1 : 1;
appendFileSync(path, `${controlLine(seq, action, new Date().toISOString())}\n`);
console.log(`${action} requested for ${id} (request ${String(seq)})`);
