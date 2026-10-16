import { eventEnvelope, type EventEnvelope, type RunEvent } from "@pokebench/agent/events";
import { readVisualPlan, verifiedVisuals, visualEvidenceSignature, type ScreenshotEvidence } from "./frontier-visual.js";
import { RunView } from "./model.js";
import { readWorkbenchSnapshot } from "./workbench-reader.js";
export interface RecordingSplit { name: string; elapsedMs: number; segmentMs: number; seq: number; turn: number; inputTokens: number; outputTokens: number; derived?: true; screenshotEvidence?: ScreenshotEvidence[] }
export interface RecordingMeasurement {
  controller: "agent" | "human"; features: string[]; logSha256: string; logBytes?: number; pausedMs: number;
  rawSplits: { name: string; elapsedMs: number; evidence: number[] }[];
  receipts?: { path: string; sha256: string }[];
  artifact?: { id: string; receipt: string; sha256: string };
}
type Milestone = Extract<RunEvent, { type: "milestone" }>;
type State = Extract<RunEvent, { type: "state"; started: boolean }>;
// skipped: events the schema rejected and a tolerant read stepped over (version skew), with the first problem.
// last: the trainer card fields of the last game state, kept because view.state is dropped from the result.
export interface NativeRecording { view: RunView; splits: RecordingSplit[]; measurement: RecordingMeasurement; skipped: { count: number; first: string } | null; last: Pick<State, "name" | "location" | "party"> | null }
function compact(state: State): State {
  return { v: state.v, run: state.run, seq: state.seq, t: state.t, turn: state.turn, type: "state", screen: state.screen,
    started: state.started, name: state.name, location: state.location, map_id: state.map_id, position: state.position, facing: state.facing,
    in_battle: state.in_battle, party: state.party, money: state.money, badges: state.badges, play_time_s: state.play_time_s,
    ...(state.story === undefined ? {} : { story: state.story }), ...(state.game_stats === undefined ? {} : { game_stats: state.game_stats }),
    ...(state.route103_rival === undefined ? {} : { route103_rival: state.route103_rival }),
    ...(state.active_ui === undefined ? {} : { active_ui: state.active_ui }), ...(state.field_controls_locked === undefined ? {} : { field_controls_locked: state.field_controls_locked }),
    ...(state.story !== undefined || state.world_context === undefined ? {} : { world_context: state.world_context }),
  };
}
// A log whose run_start this viewer's schema rejects (a newer harness): its status, turn and timing
// only, never splits, since the run's configuration is unknown. Every schema-rejected event, the
// run_start included, is stepped over with its envelope order-checked; a rejected run_end still fails.
export function readStartlessLog(path: string, id: string): { view: RunView; skipped: { count: number; first: string } } {
  const view = new RunView();
  let expected = 0, previousMs = -Infinity; const skipped = { count: 0, first: "" };
  const ordered = (event: EventEnvelope): number => {
    const ms = Date.parse(event.t);
    if (event.run !== id || event.seq !== expected || !Number.isFinite(ms) || ms < previousMs || (event.seq === 0) !== (event.type === "run_start") || view.end !== null) throw new Error("Run identity, event order or terminal sequence is invalid; no split graded");
    expected++; previousMs = ms; view.lastMs = ms; view.turn = Math.max(view.turn, event.turn);
    if (event.seq === 0) view.startMs = ms;
    return ms;
  };
  readWorkbenchSnapshot(path, event => {
    ordered(event);
    if (event.type === "run_end" || event.type === "operator_control") { view.apply(event); view.events.length = 0; }
  }, { allowAppend: true, skip: (line, problem, value) => {
    const envelope = eventEnvelope(value);
    if (envelope === null || envelope.type === "run_end") throw new Error(`line ${String(line)}: ${problem}`);
    ordered(envelope);
    if (skipped.count++ === 0) skipped.first = `line ${String(line)}: ${problem}`;
  } });
  if (skipped.count === 0) throw new Error("No unreadable run_start to step over");
  return { view, skipped };
}
// tolerate: step over schema-rejected events whose envelope is in order (never run_start or run_end) instead of failing.
export function readNativeRecording(path: string, id: string, qualified: (event: Milestone, states: readonly (RunEvent | undefined)[]) => boolean, evidenceLimit = 100000, tolerate = false): NativeRecording {
  if (!Number.isSafeInteger(evidenceLimit) || evidenceLimit < 1) throw new Error("Evidence bound must be positive");
  const view = new RunView(), states = new Map<number, RunEvent>(), splits: RecordingSplit[] = [], rawSplits: RecordingMeasurement["rawSplits"] = [];
  const visual = readVisualPlan(path), samples = new Map<number, Extract<RunEvent, {type:"human_sample"}>>();
  const wantedSamples = new Set(visual?.milestones.flatMap(m => m.screenshots.map(s => s.seq)) ?? []);
  visualEvidenceSignature(path);
  let expected = 0, previousMs = -Infinity, skipped: NativeRecording["skipped"] = null;
  const ordered = (event: EventEnvelope): number => {
    const ms = Date.parse(event.t);
    if (event.seq > 0 && event.type === "run_start") throw new Error("Run event order invalid: more than one run_start; no split graded");
    if (event.run !== id || event.seq !== expected || !Number.isFinite(ms) || ms < previousMs || (event.seq === 0 ? event.type !== "run_start" : event.type === "run_start") || view.end !== null) throw new Error("Run identity, event order or terminal sequence is invalid; no split graded");
    expected++; previousMs = ms; return ms;
  };
  const skip = (line: number, problem: string, value: unknown): void => {
    const envelope = eventEnvelope(value);
    if (envelope === null || envelope.type === "run_start" || envelope.type === "run_end") throw new Error(`line ${String(line)}: ${problem}`);
    view.lastMs = ordered(envelope); view.turn = Math.max(view.turn, envelope.turn);
    skipped = { count: (skipped?.count ?? 0) + 1, first: skipped?.first ?? `line ${String(line)}: ${problem}` };
  };
  const snapshot = readWorkbenchSnapshot(path, event => {
    const ms = ordered(event);
    if (event.type === "human_sample" && wantedSamples.has(event.seq)) samples.set(event.seq, event);
    if (["run_start", "run_end", "operator_control", "assistant", "objective_update"].includes(event.type)) {
      view.apply(event); view.events.length = 0; view.latencies.length = 0; view.errors.length = 0; view.lastThought = null;
    } else { view.lastMs = ms; view.turn = Math.max(view.turn, event.turn); }
    if (event.type === "state" && "started" in event) {
      if (states.size >= evidenceLimit) throw new Error("Native evidence state bound exceeded; no split graded");
      const nativeState = compact(event); states.set(event.seq, nativeState);
      view.apply(nativeState); view.events.length = 0;
      const resumedSplit = (name: string): boolean => name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK" || name === "RIVAL_HOUSE_ENTERED" || name === "RIVAL_HOUSE_EXITED" || name === "ROUTE_101_AFTER_HANDOFF" || name === "PLAYER_BEDROOM_EXITED_AFTER_CLOCK" || name === "ROUTE_101_AFTER_RIVAL_BATTLE" || name === "LITTLEROOT_AFTER_RIVAL_BATTLE" || name === "CLOCK_SET" || name === "PLAYER_BEDROOM";
      if (view.start !== null && !view.start.harness_features.includes("probe") && (view.start.start_state.kind === "boot" || view.milestones.some(mark => mark.derived === true && resumedSplit(mark.name)))) for (const recovered of view.milestones) {
        if (view.start.start_state.kind !== "boot" && !resumedSplit(recovered.name)) continue;
        if (recovered.derived !== true || recovered.origin !== "observed" || recovered.evidence === undefined || splits.some(s => s.name === recovered.name)) continue;
        const raw = recovered.ms - (view.startMs ?? recovered.ms);
        splits.push({ name: recovered.name, elapsedMs: Math.max(0, raw - view.control.pausedBefore(recovered.ms)), segmentMs: 0, seq: recovered.seq, turn: event.turn, inputTokens: view.tokens.input, outputTokens: view.tokens.output, derived: true });
        rawSplits.push({ name: recovered.name, elapsedMs: raw, evidence: [...recovered.evidence] });
      }
    }
    if (event.type === "milestone" && event.origin === "observed" && event.evidence !== undefined && !view.start?.harness_features.includes("probe") && qualified(event, event.evidence.map(seq => states.get(seq))) && !splits.some(s => s.name === event.name && s.derived !== true)) {
      const raw = ms - (view.startMs ?? ms), elapsedMs = Math.max(0, raw - view.control.pausedBefore(ms));
      const recovered = splits.findIndex(s => s.name === event.name);
      if (recovered >= 0) { splits.splice(recovered, 1); rawSplits.splice(rawSplits.findIndex(s => s.name === event.name), 1); }
      splits.push({ name: event.name, elapsedMs, segmentMs: 0, seq: event.seq, turn: event.turn, inputTokens: view.tokens.input, outputTokens: view.tokens.output });
      view.apply(event); view.events.length = 0;
      rawSplits.push({ name: event.name, elapsedMs: raw, evidence: [...event.evidence] });
    }
  }, { allowAppend: true, ...(tolerate ? { skip } : {}) });
  const hash = snapshot.sha256;
  if (view.start === null) throw new Error("No complete run_start yet");
  for (const mark of verifiedVisuals(visual, view.start, hash, samples)) {
    const existing = splits.findIndex(s => s.name === mark.name);
    if (existing >= 0 && splits[existing]?.derived !== true) continue;
    if (existing >= 0) { splits.splice(existing, 1); rawSplits.splice(rawSplits.findIndex(s => s.name === mark.name), 1); }
    const raw = Date.parse(mark.sample.t) - (view.startMs ?? 0);
    splits.push({ name: mark.name, elapsedMs: Math.max(0, raw - view.control.pausedBefore(Date.parse(mark.sample.t))), segmentMs: 0, seq: mark.sample.seq, turn: mark.sample.turn, inputTokens: 0, outputTokens: 0, derived: true, screenshotEvidence: mark.screenshots });
    rawSplits.push({ name: mark.name, elapsedMs: raw, evidence: mark.screenshots.map(s => s.seq) });
  }
  splits.sort((a, b) => a.elapsedMs - b.elapsedMs || a.seq - b.seq);
  let previousSplit = 0; for (const split of splits) { split.segmentMs = split.elapsedMs - previousSplit; previousSplit = split.elapsedMs; }
  const last = view.state === null || !("started" in view.state) ? null : { name: view.state.name, location: view.state.location, party: view.state.party };
  view.state = null;
  return { view, last, splits, measurement: { controller: view.start.controller?.kind === "human" ? "human" : "agent", features: [...view.start.harness_features], logSha256: hash, logBytes: snapshot.bytes, pausedMs: view.control.pausedBefore(view.lastMs ?? view.startMs ?? 0), rawSplits }, skipped };
}
