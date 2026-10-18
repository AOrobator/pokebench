// Reads runs/<id>/watch.jsonl, or builds it once from the event log when an older run has none.
import { existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { WATCH_FILE, formatWatch, parseWatch, type WatchSnapshot } from "@pokebench/agent/watch-snapshot";
import { RunView } from "./model.js";
import { RunsError, eventsPath, readFrom, runDir } from "./runs.js";

export type { WatchSnapshot };

function snapshotOf(view: RunView): WatchSnapshot {
  const start = view.startMs ?? 0;
  const state = view.state;
  return {
    milestones: view.milestones.map((milestone) => ({
      name: milestone.name,
      offsetMs: Math.max(0, Math.round(milestone.ms - start - view.control.pausedBefore(milestone.ms))),
      origin: milestone.origin ?? "observed",
      ...(milestone.derived === true ? { derived: true as const } : {}),
    })),
    party: state === null ? null : state.party.map((mon) => ({ species: mon.species, level: mon.level, hp: mon.hp, max_hp: mon.max_hp })),
    location: state?.location ?? null,
    map_id: state?.map_id ?? null,
  };
}

function rebuild(events: string, file: string): WatchSnapshot {
  const view = new RunView();
  for (const line of readFrom(events, 0, 0).results) if (line.ok) view.apply(line.event);
  const snapshot = snapshotOf(view);
  const text = formatWatch(snapshot);
  try {
    writeFileSync(file, text, { flag: "wx" });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") return parseWatch(readFileSync(file, "utf8"));
    throw error;
  }
  return snapshot;
}

export function readWatch(runsRoot: string, runId: string): WatchSnapshot {
  const dir = runDir(runsRoot, runId);
  const events = eventsPath(runsRoot, runId);
  if (!existsSync(events)) throw new RunsError(`run ${runId} has no events.jsonl`);
  const file = join(dir, WATCH_FILE);
  if (existsSync(file)) {
    if (lstatSync(file).isSymbolicLink()) throw new RunsError(`run ${runId} watch file is a symlink`);
    return parseWatch(readFileSync(file, "utf8"));
  }
  return rebuild(events, file);
}
