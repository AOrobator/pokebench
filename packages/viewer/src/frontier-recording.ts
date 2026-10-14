import { statSync } from "node:fs";
import type { RunEvent } from "@pokebench/agent/events";
import { RunView } from "./model.js";
import { reduceWorkbenchLog } from "./workbench-reader.js";
export interface RecordingSplit { name: string; elapsedMs: number; segmentMs: number; seq: number; turn: number; inputTokens: number; outputTokens: number }
export interface RecordingMeasurement {
  controller: "agent" | "human"; features: string[]; logSha256: string; pausedMs: number;
  rawSplits: { name: string; elapsedMs: number; evidence: number[] }[];
  receipts?: { path: string; sha256: string }[];
  artifact?: { id: string; receipt: string; sha256: string };
}
type Milestone = Extract<RunEvent, { type: "milestone" }>;
type State = Extract<RunEvent, { type: "state"; started: boolean }>;
export interface NativeRecording { view: RunView; splits: RecordingSplit[]; measurement: RecordingMeasurement }
function compact(state: State): State {
  return { v: state.v, run: state.run, seq: state.seq, t: state.t, turn: state.turn, type: "state", screen: state.screen,
    started: state.started, name: state.name, location: state.location, map_id: state.map_id, position: state.position, facing: state.facing,
    in_battle: state.in_battle, party: state.party, money: state.money, badges: state.badges, play_time_s: state.play_time_s,
    ...(state.story === undefined ? {} : { story: state.story }), ...(state.game_stats === undefined ? {} : { game_stats: state.game_stats }),
    ...(state.active_ui === undefined ? {} : { active_ui: state.active_ui }), ...(state.field_controls_locked === undefined ? {} : { field_controls_locked: state.field_controls_locked }),
    ...(state.story !== undefined || state.world_context === undefined ? {} : { world_context: state.world_context }),
  };
}
export function readNativeRecording(path: string, id: string, qualified: (event: Milestone, states: readonly (RunEvent | undefined)[]) => boolean, evidenceLimit = 100000): NativeRecording {
  if (!Number.isSafeInteger(evidenceLimit) || evidenceLimit < 1) throw new Error("Evidence bound must be positive");
  const view = new RunView(), states = new Map<number, RunEvent>(), splits: RecordingSplit[] = [], rawSplits: RecordingMeasurement["rawSplits"] = [];
  const size = statSync(path).size; let expected = 0, previousMs = -Infinity, lastSplit = 0;
  const hash = reduceWorkbenchLog(path, event => {
    const ms = Date.parse(event.t);
    if (event.run !== id || event.seq !== expected || !Number.isFinite(ms) || ms < previousMs || (event.seq === 0 ? event.type !== "run_start" : event.type === "run_start") || view.end !== null) throw new Error("Run identity, event order or terminal sequence is invalid; no split graded");
    expected++; previousMs = ms;
    if (event.type === "run_start" && event.controller?.kind !== "human" && size > 64 * 1024 * 1024) throw new Error("Agent log exceeds the 64 MiB read bound; no split graded");
    if (["run_start", "run_end", "operator_control", "assistant", "objective_update"].includes(event.type)) {
      view.apply(event); view.events.length = 0; view.latencies.length = 0; view.errors.length = 0; view.lastThought = null;
    } else { view.lastMs = ms; view.turn = Math.max(view.turn, event.turn); }
    if (event.type === "state" && "started" in event) {
      if (states.size >= evidenceLimit) throw new Error("Native evidence state bound exceeded; no split graded");
      states.set(event.seq, compact(event));
    }
    if (event.type === "milestone" && event.origin === "observed" && event.evidence !== undefined && !view.start?.harness_features.includes("probe") && qualified(event, event.evidence.map(seq => states.get(seq))) && !splits.some(s => s.name === event.name)) {
      const raw = ms - (view.startMs ?? ms), elapsedMs = Math.max(0, raw - view.control.pausedBefore(ms));
      splits.push({ name: event.name, elapsedMs, segmentMs: elapsedMs - lastSplit, seq: event.seq, turn: event.turn, inputTokens: view.tokens.input, outputTokens: view.tokens.output }); lastSplit = elapsedMs;
      rawSplits.push({ name: event.name, elapsedMs: raw, evidence: [...event.evidence] });
    }
  });
  if (view.start === null) throw new Error("No complete run_start yet");
  return { view, splits, measurement: { controller: view.start.controller?.kind === "human" ? "human" : "agent", features: [...view.start.harness_features], logSha256: hash, pausedMs: view.control.pausedBefore(view.lastMs ?? view.startMs ?? 0), rawSplits } };
}
