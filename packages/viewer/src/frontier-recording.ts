import { createHash, type Hash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { eventEnvelope, eventProblem, type EventEnvelope, type RunEvent } from "@pokebench/agent/events";
import { readVisualPlan, verifiedVisuals, visualEvidenceSignature, type ScreenshotEvidence } from "./frontier-visual.js";
import { ControlView, RunView } from "./model.js";
import { readWorkbenchSnapshot } from "./workbench-reader.js";
import { recoveredAttacher } from "./recovered-fields.js";
import { dirname } from "node:path";
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
export interface RecordingFileIdentity { dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }
export interface NativeRecordingTailer { read(): NativeRecording; fileIdentity(): RecordingFileIdentity | null }
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
  return createNativeRecordingTailer(path, id, qualified, evidenceLimit, tolerate, () => undefined, true).read();
}

// Incremental equivalent of readNativeRecording for an append-only live log. A tailer owns the
// reducer state and consumes each appended byte once; callers must discard it after a rewrite,
// truncation, replacement, or auxiliary-evidence change. readNativeRecording deliberately creates
// a fresh tailer so one-shot validation retains its historical behavior.
export function createNativeRecordingTailer(path: string, id: string, qualified: (event: Milestone, states: readonly (RunEvent | undefined)[]) => boolean, evidenceLimit = 100000, tolerate = false, observeRead: (offset: number, bytes: number) => void = () => undefined, verifyPrefix = false): NativeRecordingTailer {
  if (!Number.isSafeInteger(evidenceLimit) || evidenceLimit < 1) throw new Error("Evidence bound must be positive");
  const view = new RunView(), states = new Map<number, RunEvent>(), splits: RecordingSplit[] = [], rawSplits: RecordingMeasurement["rawSplits"] = [];
  const visual = readVisualPlan(path), samples = new Map<number, Extract<RunEvent, {type:"human_sample"}>>();
  const wantedSamples = new Set(visual?.milestones.flatMap(m => m.screenshots.map(s => s.seq)) ?? []);
  visualEvidenceSignature(path);
  let expected = 0, previousMs = -Infinity, skipped: NativeRecording["skipped"] = null, offset = 0, line = 0, pending = Buffer.alloc(0);
  const hash: Hash = createHash("sha256");
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
  const recovered = recoveredAttacher(dirname(path));
  let fileIdentity: RecordingFileIdentity | null = null;
  const consume = (logged: RunEvent): void => {
    const event = recovered(logged);
    const ms = ordered(event);
    if (event.type === "human_sample" && wantedSamples.has(event.seq)) samples.set(event.seq, event);
    if (["run_start", "run_end", "operator_control", "assistant", "objective_update"].includes(event.type)) {
      view.apply(event); view.events.length = 0; view.latencies.length = 0; view.errors.length = 0; view.lastThought = null;
    } else { view.lastMs = ms; view.turn = Math.max(view.turn, event.turn); }
    if (event.type === "state" && "started" in event) {
      if (states.size >= evidenceLimit) throw new Error("Native evidence state bound exceeded; no split graded");
      const nativeState = compact(event); states.set(event.seq, nativeState);
      view.apply(nativeState); view.events.length = 0;
      const resumedSplit = (name: string): boolean => name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK" || name === "RIVAL_HOUSE_ENTERED" || name === "RIVAL_HOUSE_EXITED" || name === "ROUTE_101_AFTER_HANDOFF" || name === "PLAYER_BEDROOM_EXITED_AFTER_CLOCK" || name === "ROUTE_101_AFTER_RIVAL_BATTLE" || name === "LITTLEROOT_AFTER_RIVAL_BATTLE" || name === "RIVAL_BATTLE_STARTED" || name === "RIVAL_BATTLE_DEFEATED" || name === "RIVAL_OLDALE_SEND_OFF" || name === "CLOCK_SET" || name === "PLAYER_BEDROOM";
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
  };

  const append = (): void => {
    const fd = openSync(path, "r");
    try {
      const before = fstatSync(fd), maxBytes = 512 * 1024 * 1024, lineBytes = 1024 * 1024, chunkBytes = 64 * 1024;
      if (before.size > maxBytes) throw new Error("Run log exceeds the streaming byte bound; no split graded");
      if (before.size < offset) throw new Error("Run log changed during reduction; snapshot unavailable");
      const chunk = Buffer.alloc(Math.min(chunkBytes, maxBytes));
      while (offset < before.size) {
        const at = offset, count = readSync(fd, chunk, 0, Math.min(chunk.length, before.size - offset), offset);
        if (count === 0) throw new Error("Run log changed during reduction; snapshot unavailable");
        observeRead(at, count);
        offset += count; const bytes = Buffer.from(chunk.subarray(0, count)); hash.update(bytes);
        const joined = pending.length === 0 ? bytes : Buffer.concat([pending, bytes]);
        let start = 0;
        for (let end = joined.indexOf(0x0a); end >= 0; end = joined.indexOf(0x0a, start)) {
          if (end - start > lineBytes) throw new Error("Run log line exceeds the streaming line bound");
          line += 1; const text = joined.subarray(start, end).toString("utf8"); start = end + 1;
          if (text.trim() === "") continue;
          let value: unknown;
          try { value = JSON.parse(text); } catch (error) { throw new Error(`line ${String(line)}: event line is not JSON: ${String(error)}`, { cause: error }); }
          const problem = eventProblem(value);
          if (problem === null) consume(value as RunEvent);
          else if (tolerate) skip(line, problem, value);
          else throw new Error(`line ${String(line)}: ${problem}`);
        }
        pending = Buffer.from(joined.subarray(start));
        if (pending.length > lineBytes) throw new Error("Run log line exceeds the streaming line bound");
      }
      const after = fstatSync(fd);
      if (after.dev !== before.dev || after.ino !== before.ino || after.size < before.size) throw new Error("Run log changed during reduction; snapshot unavailable");
      // Growth is the normal append-only case. With no growth, any metadata
      // change means bytes may have been replaced after readSync copied them;
      // never commit that possibly mixed snapshot into the persistent tailer.
      if (after.size === before.size && (after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs)) throw new Error("Run log changed during reduction; snapshot unavailable");
      if (verifyPrefix) {
        const verified = createHash("sha256"); let checked = 0;
        while (checked < before.size) {
          const count = readSync(fd, chunk, 0, Math.min(chunk.length, before.size - checked), checked);
          if (count === 0) throw new Error("Run log changed during reduction; snapshot unavailable");
          verified.update(chunk.subarray(0, count)); checked += count;
        }
        if (verified.digest("hex") !== hash.copy().digest("hex")) throw new Error("Run log changed during reduction; snapshot unavailable");
      }
      fileIdentity = { dev: after.dev, ino: after.ino, size: after.size, mtimeMs: after.mtimeMs, ctimeMs: after.ctimeMs };
    } finally { closeSync(fd); }
  };

  return { fileIdentity: () => fileIdentity, read: (): NativeRecording => {
    append();
    if (view.start === null) throw new Error("No complete run_start yet");
    const digest = hash.copy().digest("hex"), outputSplits = splits.map(s => ({ ...s })), outputRaw = rawSplits.map(s => ({ ...s, evidence: [...s.evidence] }));
    for (const mark of verifiedVisuals(visual, view.start, digest, samples)) {
      const existing = outputSplits.findIndex(s => s.name === mark.name);
      if (existing >= 0 && outputSplits[existing]?.derived !== true) continue;
      if (existing >= 0) { outputSplits.splice(existing, 1); outputRaw.splice(outputRaw.findIndex(s => s.name === mark.name), 1); }
      const raw = Date.parse(mark.sample.t) - (view.startMs ?? 0);
      outputSplits.push({ name: mark.name, elapsedMs: Math.max(0, raw - view.control.pausedBefore(Date.parse(mark.sample.t))), segmentMs: 0, seq: mark.sample.seq, turn: mark.sample.turn, inputTokens: 0, outputTokens: 0, derived: true, screenshotEvidence: mark.screenshots });
      outputRaw.push({ name: mark.name, elapsedMs: raw, evidence: mark.screenshots.map(s => s.seq) });
    }
    outputSplits.sort((a, b) => a.elapsedMs - b.elapsedMs || a.seq - b.seq);
    let previousSplit = 0; for (const split of outputSplits) { split.segmentMs = split.elapsedMs - previousSplit; previousSplit = split.elapsedMs; }
    const last = view.state === null || !("started" in view.state) ? null : { name: view.state.name, location: view.state.location, party: structuredClone(view.state.party) };
    const outputView = Object.assign(new RunView(), structuredClone(view));
    Object.defineProperty(outputView, "control", { value: Object.assign(new ControlView(), structuredClone(view.control)), enumerable: true, configurable: true });
    outputView.state = null;
    return { view: outputView, last, splits: outputSplits, measurement: { controller: view.start.controller?.kind === "human" ? "human" : "agent", features: [...view.start.harness_features], logSha256: digest, logBytes: offset, pausedMs: view.control.pausedBefore(view.lastMs ?? view.startMs ?? 0), rawSplits: outputRaw }, skipped: skipped === null ? null : { ...skipped } };
  } };
}
