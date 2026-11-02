#!/usr/bin/env node
// Answers "who owns this pid or port?" before anything is killed, restarted or reused.
// Exit 0 = nobody live owns it; exit 1 = a live run does (do not touch it); exit 2 = bad usage.
import {claimsMatching, describeClaim, listClaims, ownedMessage} from "../packages/agent/dist/run-claim.js";

const runsRoot = process.env.POKEBENCH_RUNS_ROOT ?? new URL("../runs", import.meta.url).pathname;
const argv = process.argv.slice(2);
const value = (flag) => {
  const at = argv.indexOf(flag);
  return at === -1 ? undefined : argv[at + 1];
};
const number = (flag) => {
  const raw = value(flag);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`${flag} needs a positive integer`);
    process.exit(2);
  }
  return parsed;
};

const pid = number("--pid");
const port = number("--port");

if (argv.includes("--list")) {
  const live = listClaims(runsRoot).filter((claim) => claim.ended === undefined);
  if (live.length === 0) console.log("no live runs claim a pid or port");
  for (const claim of live) console.log(`${describeClaim(claim)} since ${claim.started}, heartbeat ${claim.heartbeat}`);
  process.exit(0);
}

if (pid === undefined && port === undefined) {
  console.error("usage: run-claim.mjs --list | --pid <pid> [--port <port>]");
  process.exit(2);
}

const owners = claimsMatching(listClaims(runsRoot), {pid, port});
if (owners.length === 0) {
  const what = [pid === undefined ? null : `pid ${String(pid)}`, port === undefined ? null : `port ${String(port)}`].filter(Boolean).join(" and ");
  console.log(`no live run owns ${what}`);
  process.exit(0);
}

for (const claim of owners) console.error(ownedMessage(claim, port !== undefined ? `port ${String(port)}` : `pid ${String(pid)}`));
process.exit(1);
