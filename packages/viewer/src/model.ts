// A run's events folded into what the panels show. Shared by the browser and
// tests; it imports only types from the agent's schema.
import type { RunEvent } from "@pokebench/agent/events";
import { eventMs, num } from "./format.js";

type Of<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;
export type RunStartEvent = Of<"run_start">;
export type RunEndEvent = Of<"run_end">;
type AnyStateEvent = Of<"state">;
export type StateEvent = Extract<AnyStateEvent, { started: boolean }>;
export type Button = Of<"button_press">["buttons"][number];

// The pinned vendor's "normal" preset; M4 logs predate recorded timing.
export const ASSUMED_TIMING = { hold_frames: 10, release_frames: 8 } as const;

export interface Press {
  readonly seq: number;
  readonly ms: number;
  readonly buttons: readonly Button[];
  readonly hold: number;
  readonly release: number;
  readonly assumed: boolean;
}

export interface Span {
  readonly startMs: number;
  endMs: number | null;
}

export interface ToolSpan extends Span {
  readonly name: string;
  error: boolean;
}

export interface ErrorMark {
  readonly ms: number;
  readonly kind: "retry" | "model" | "tool" | "compaction" | "telemetry";
  readonly label: string;
}

export interface Thought {
  readonly turn: number;
  readonly thinking: string;
  readonly reply: string;
  readonly latencyMs: number;
}

// One entry per schema event type: adding a type to the agent schema fails to
// compile here until the viewer lists it.
const KNOWN: Record<RunEvent["type"], true> = {
  objective_update: true,
  objective_attempt: true,
  run_start: true,
  turn_start: true,
  assistant: true,
  assistant_delta: true,
  tool_call: true,
  button_press: true,
  tool_result: true,
  milestone: true,
  retry: true,
  disk_usage: true,
  frames_evicted: true,
  run_end: true,
  state: true,
  compaction: true,
  telemetry_error: true,
};
const EVENT_TYPES = new Set<string>(Object.keys(KNOWN));

// The server validates every line against the TypeBox schema before sending
// it; the browser re-checks the envelope it relies on.
export function isRunEvent(value: unknown): value is RunEvent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.type === "string" &&
    EVENT_TYPES.has(record.type) &&
    typeof record.seq === "number" &&
    typeof record.turn === "number" &&
    typeof record.run === "string" &&
    typeof record.t === "string"
  );
}

function samePlace(a: StateEvent, b: StateEvent): boolean {
  return a.location === b.location && a.position?.x === b.position?.x && a.position?.y === b.position?.y;
}

export const MILESTONE_ORDER = ["GAME_RUNNING", "NEW_GAME_CREATED", "PLAYER_NAME_CONFIRMED", "PLAYER_NAME_SET", "FIRST_TRUCK_EXIT", "INTRO_CUTSCENE_COMPLETE", "LITTLEROOT_TOWN", "PLAYER_HOUSE_ENTERED", "MOM_CLOCK_INSTRUCTION", "PLAYER_BEDROOM", "CLOCK_SET", "MOM_RIVAL_INSTRUCTION", "RIVAL_MET", "ROUTE_101", "STARTER_CHOSEN", "BIRCH_RESCUE_COMPLETE", "BIRCH_STARTER_HANDOFF_COMPLETE", "OLDALE_TOWN", "ROUTE_103", "RIVAL_BATTLE_WON", "RECEIVED_POKEDEX", "STARTER_TUTORIAL_COMPLETE", "RUNNING_SHOES_RECEIVED", "ROUTE_102", "PETALBURG_CITY", "DAD_FIRST_MEETING", "WALLY_TUTORIAL_COMPLETE", "ROUTE_104", "PETALBURG_WOODS", "TEAM_AQUA_WOODS_EVENT_COMPLETE", "RUSTBORO_CITY", "RUSTBORO_CITY_GYM", "RUSTBORO_GYM_COMPLETE", "STONE_BADGE", "ROCK_TOMB_RECEIVED"] as const;

export class RunView {
  readonly events: RunEvent[] = [];
  start: RunStartEvent | null = null;
  startMs: number | null = null;
  end: RunEndEvent | null = null;
  lastMs: number | null = null;
  turn = 0;
  turnStartMs: number | null = null;
  lastThought: Thought | null = null;
  frame: string | null = null;
  state: StateEvent | null = null;
  legacyState = false;
  objective: Of<"objective_update">["objective"] | null = null;
  readonly attempts: Of<"objective_attempt">["attempt"][] = [];
  context: Of<"turn_start">["context"] | null = null;
  disk: { bytes: number; cap_bytes: number; percent: number } | null = null;
  retry: { count: number; attempt: number; limit: number } | null = null;
  tokens = { input: 0, output: 0 };
  readonly latencies: number[] = [];
  lastTps: number | null = null;
  modelErrors = 0;
  toolErrors = 0;
  compactions = 0;
  stuck: { now: number; max: number } | null = null;
  readonly milestones: { name: string; ms: number; seq: number; derived?: boolean; kind?: "story" | "navigation" | "legacy"; origin?: "observed" | "present_at_start"; evidence?: readonly number[] }[] = [];
  readonly presses: Press[] = [];
  readonly thinkingSpans: Span[] = [];
  streaming = { thinking: "", text: "" };
  readonly toolSpans: ToolSpan[] = [];
  readonly errors: ErrorMark[] = [];
  private readonly openTools = new Map<string, ToolSpan>();

  get isThinking(): boolean {
    return this.thinkingSpans.at(-1)?.endMs === null;
  }

  bySeq(seq: number): RunEvent | undefined {
    return this.events.find((event) => event.seq === seq);
  }

  apply(event: RunEvent): void {
    const last = this.events.at(-1);
    if (last !== undefined && event.seq <= last.seq) return;
    this.events.push(event);
    const ms = eventMs(event);
    this.lastMs = ms;
    this.turn = Math.max(this.turn, event.turn);
    switch (event.type) {
      case "objective_update": this.objective = event.objective; break;
      case "objective_attempt": this.attempts.push(event.attempt); break;
      case "run_start":
        this.start = event;
        this.startMs = ms;
        break;
      case "turn_start":
        this.turnStartMs = ms;
        if (this.start?.harness_features.includes("probe")) break;
        this.context = event.context;
        this.thinkingSpans.push({ startMs: ms, endMs: null });
        this.streaming = { thinking: "", text: "" };
        break;
      case "assistant_delta":
        this.streaming = { thinking: this.streaming.thinking + event.thinking, text: this.streaming.text + event.text };
        break;
      case "assistant":
        this.onAssistant(event, ms);
        break;
      case "tool_call": {
        const span: ToolSpan = { startMs: ms, endMs: null, name: event.name, error: false };
        this.toolSpans.push(span);
        this.openTools.set(event.id, span);
        break;
      }
      case "tool_result":
        this.onToolResult(event, ms);
        break;
      case "button_press":
        this.presses.push({
          seq: event.seq,
          ms,
          buttons: event.buttons,
          hold: event.hold_frames ?? ASSUMED_TIMING.hold_frames,
          release: event.release_frames ?? ASSUMED_TIMING.release_frames,
          assumed: event.hold_frames === undefined,
        });
        break;
      case "milestone":
        if (!this.milestones.some((m) => m.name === event.name)) this.milestones.push({ name: event.name, ms, seq: event.seq, ...(event.kind === undefined ? {} : {kind:event.kind}), ...(event.origin === undefined ? {} : {origin:event.origin}), ...(event.evidence === undefined ? {} : {evidence:event.evidence}) });
        break;
      case "retry":
        this.retry = { count: (this.retry?.count ?? 0) + 1, attempt: event.attempt, limit: event.limit };
        this.errors.push({ ms, kind: "retry", label: `retry ${String(event.attempt)}/${String(event.limit)}: ${event.reason}` });
        break;
      case "disk_usage":
        this.disk = { bytes: event.bytes, cap_bytes: event.cap_bytes, percent: event.percent };
        break;
      case "state":
        this.onState(event);
        break;
      case "compaction":
        this.compactions += 1;
        this.errors.push({ ms, kind: "compaction", label: `compacted ${num(event.from_tokens)} → ${num(event.to_tokens)}` });
        break;
      case "telemetry_error":
        this.errors.push({ ms, kind: "telemetry", label: `${event.source} read failed: ${event.message}` });
        break;
      case "run_end":
        this.end = event;
        this.closeOpenSpans(ms);
        break;
      case "frames_evicted":
        break;
    }
  }

  private onAssistant(event: Of<"assistant">, ms: number): void {
    const span = this.thinkingSpans.at(-1);
    if (span?.endMs === null) span.endMs = ms;
    this.lastThought = { turn: event.turn, thinking: event.thinking, reply: event.text, latencyMs: event.latency_ms };
    this.tokens = { input: this.tokens.input + event.usage.input, output: this.tokens.output + event.usage.output };
    if (event.stop_reason === "error") {
      this.modelErrors += 1;
      this.errors.push({ ms, kind: "model", label: `model error: ${event.error ?? "unknown"}` });
      return;
    }
    this.latencies.push(event.latency_ms);
    this.lastTps = event.latency_ms > 0 ? event.usage.output / (event.latency_ms / 1000) : null;
  }

  private closeOpenSpans(ms: number): void {
    const thinking = this.thinkingSpans.at(-1);
    if (thinking?.endMs === null) thinking.endMs = ms;
    for (const span of this.openTools.values()) span.endMs = ms;
    this.openTools.clear();
  }

  private onToolResult(event: Of<"tool_result">, ms: number): void {
    const span = this.openTools.get(event.id);
    if (span !== undefined) {
      span.endMs = ms;
      span.error = event.is_error;
      this.openTools.delete(event.id);
    }
    const [frame] = event.frames;
    if (frame !== undefined) this.frame = frame.path;
    if (event.is_error) {
      this.toolErrors += 1;
      this.errors.push({ ms, kind: "tool", label: `${event.name} failed: ${event.text}` });
    }
  }

  private onState(event: AnyStateEvent): void {
    if (!("started" in event)) {
      this.legacyState = true;
      return;
    }
    // Older logs already recorded this coherent RAM script variable. Preserve
    // source-state sequence and first observation time; never rewrite the log.
    if (event.story === undefined && event.started && event.world_context?.triggers.some((t) => t.variable === 0x4092 && (t.current_value === 6 || t.current_value === 7)) && !this.milestones.some((m) => m.name === "CLOCK_SET")) {
      this.milestones.push({ name: "CLOCK_SET", ms: eventMs(event), seq: event.seq, derived: true });
    }
    const previous = this.state;
    this.state = event;
    const now = event.started && event.position !== null && event.field_controls_locked !== true && previous !== null && samePlace(previous, event) ? (this.stuck?.now ?? 0) + 1 : 0;
    this.stuck = { now, max: Math.max(now, this.stuck?.max ?? 0) };
  }
}

export function foldUntil(events: readonly RunEvent[], ms: number): RunView {
  const view = new RunView();
  for (const event of events) {
    if (eventMs(event) > ms) break;
    view.apply(event);
  }
  return view;
}
