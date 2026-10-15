// A run's events folded into what the panels show. Shared by the browser and
// tests; it imports only types from the agent's schema.
import type { RunEvent } from "@pokebench/agent/events";
import { eventMs, hms, num } from "./format.js";

type Of<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;
export type RunStartEvent = Of<"run_start">;
export type RunEndEvent = Of<"run_end">;
type AnyStateEvent = Of<"state">;
export type StateEvent = Extract<AnyStateEvent, { started: boolean }>;
export type Button = Of<"button_press">["buttons"][number] | Of<"human_input">["buttons"][number];

// The pinned vendor's "normal" preset; M4 logs predate recorded timing.
export const ASSUMED_TIMING = { hold_frames: 10, release_frames: 8 } as const;

export interface Press {
  readonly seq: number;
  readonly ms: number;
  readonly buttons: readonly Button[];
  readonly hold: number;
  readonly release: number;
  readonly assumed: boolean;
  readonly automaticRunning?:boolean;
  readonly walking?:boolean;
  readonly endMs?:number;
  readonly startFrame?:number;
  readonly endFrame?:number;
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
  readonly kind: "retry" | "model" | "tool" | "compaction" | "telemetry" | "loop";
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
  operator_control: true,
  loop_guard: true,
  objective_update: true,
  objective_attempt: true,
  run_start: true,
  turn_start: true,
  assistant: true,
  assistant_delta: true,
  tool_call: true,
  button_press: true,
  navigation_context:true,
  ledger_context:true,
  milestone_hint:true,
  decision_input:true,
  wait_input:true,
  human_input:true,
  human_sample:true,
  tool_result: true,
  milestone: true,
  activity: true,
  native_action:true, battle_choice:true,
  retry: true,
  text_only_supervisor: true,
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

// Mirrors StateMilestones route proof. A Clock set save has no pre-clock frame, so home is the
// first stable Littleroot house before any other map. The original log stays unchanged.
function houseFamily(location: string | null, floor: "1F" | "2F"): string | null {
  return location?.match(new RegExp(`^LITTLEROOT TOWN (BRENDANS|MAYS) HOUSE ${floor}$`))?.[1] ?? null;
}
function clockSet(state: StateEvent): boolean | null {
  if (state.story !== undefined) return state.screen === "field_transition" ? null : state.started && state.screen !== "field_transition" ? state.story?.clock_set ?? null : null;
  if (!state.started || state.screen === "field_transition") return null;
  const value = state.world_context?.triggers.find(trigger => trigger.variable === 0x4092)?.current_value;
  return value == null || value < 0 || value > 7 ? null : value === 6 || value === 7;
}
function routeHomeOf(state: StateEvent): string | null {
  const saved = state.started && state.screen !== "field_transition" && state.screen !== "unknown";
  const witnessed = saved && state.story?.clock_set === false && [4, 5].includes(state.story.intro_stage ?? -1) ? houseFamily(state.location, "1F") ?? houseFamily(state.location, "2F") : null;
  return witnessed ?? (saved && clockSet(state) === true ? houseFamily(state.location, "1F") ?? houseFamily(state.location, "2F") : null);
}

export const MILESTONE_ORDER = ["GAME_RUNNING", "NEW_GAME_CREATED", "PLAYER_NAME_CONFIRMED", "PLAYER_NAME_SET", "FIRST_TRUCK_EXIT", "INTRO_CUTSCENE_COMPLETE", "LITTLEROOT_TOWN", "PLAYER_HOUSE_ENTERED", "MOM_CLOCK_INSTRUCTION", "PLAYER_BEDROOM", "CLOCK_SET", "MOM_RIVAL_INSTRUCTION", "PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED", "RIVAL_MET", "RIVAL_HOUSE_EXITED", "BIRCH_RESCUE_REQUESTED", "ROUTE_101", "STARTER_CHOSEN", "BIRCH_RESCUE_COMPLETE", "BIRCH_STARTER_HANDOFF_COMPLETE", "OLDALE_TOWN", "ROUTE_103", "RIVAL_BATTLE_WON", "RECEIVED_POKEDEX", "STARTER_TUTORIAL_COMPLETE", "RUNNING_SHOES_RECEIVED", "FIRST_POKEMON_CAUGHT", "FIRST_EVOLUTION", "FIRST_POKECENTER_HEAL", "ROUTE_102", "ROUTE_102_TRAINER_CALVIN_DEFEATED", "ROUTE_102_TRAINER_RICK_DEFEATED", "ROUTE_102_TRAINER_TIANA_DEFEATED", "ROUTE_102_TRAINER_ALLEN_DEFEATED", "PETALBURG_CITY", "DAD_FIRST_MEETING", "WALLY_TUTORIAL_COMPLETE", "ROUTE_104", "ROUTE_104_TRAINER_IVAN_DEFEATED", "ROUTE_104_TRAINER_BILLY_DEFEATED", "ROUTE_104_TRAINER_HALEY_DEFEATED", "ROUTE_104_TRAINER_WINSTON_DEFEATED", "ROUTE_104_TRAINER_CINDY_DEFEATED", "ROUTE_104_TRAINER_GINA_MIA_DEFEATED", "ROUTE_104_TRAINER_DARIAN_DEFEATED", "PETALBURG_WOODS", "PETALBURG_WOODS_TRAINER_LYLE_DEFEATED", "PETALBURG_WOODS_TRAINER_JAMES_DEFEATED", "PETALBURG_WOODS_TRAINER_AQUA_GRUNT_DEFEATED", "TEAM_AQUA_WOODS_EVENT_COMPLETE", "RUSTBORO_CITY", "ROUTE_115", "ROUTE_116", "ROUTE_116_TRAINER_JOEY_DEFEATED", "ROUTE_116_TRAINER_JOSE_DEFEATED", "ROUTE_116_TRAINER_JERRY_DEFEATED", "ROUTE_116_TRAINER_CLARK_DEFEATED", "ROUTE_116_TRAINER_JANICE_DEFEATED", "ROUTE_116_TRAINER_KAREN_DEFEATED", "ROUTE_116_TRAINER_SARAH_DEFEATED", "ROUTE_116_TRAINER_DAWSON_DEFEATED", "ROUTE_116_TRAINER_DEVAN_DEFEATED", "ROUTE_116_TRAINER_JOHNSON_DEFEATED", "RUSTURF_TUNNEL", "RUSTBORO_CITY_GYM", "RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", "RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED", "RUSTBORO_GYM_TRAINER_MARC_DEFEATED", "ROXANNE_DEFEATED", "RUSTBORO_GYM_COMPLETE", "STONE_BADGE", "ROCK_TOMB_RECEIVED"] as const;

export type ControlState = "running" | "pause_pending" | "paused" | "stop_pending" | "ended";

// Operator control as recorded by the agent (operator_control events).
export class ControlView {
  state: ControlState = "running";
  emulatorFrozen: boolean | null = null;
  readonly pauses: { startMs: number; endMs: number | null }[] = [];

  apply(event: Of<"operator_control">, ms: number): void {
    if (event.status === "ignored" || event.status === "failed") return;
    if (event.status === "pending") {
      this.state = event.action === "pause" ? "pause_pending" : "stop_pending";
      return;
    }
    if (event.action === "pause") {
      this.state = "paused";
      this.emulatorFrozen = event.emulator_frozen ?? null;
      this.pauses.push({ startMs: ms, endMs: null });
      return;
    }
    this.close(ms);
    this.state = event.action === "resume" || event.action === "cancel_stop" ? "running" : "ended";
  }

  close(ms: number): void {
    const open = this.pauses.at(-1);
    if (open !== undefined && open.endMs === null) open.endMs = ms;
  }

  pausedMs(nowMs: number): number {
    return this.pausedBefore(nowMs);
  }

  // Paused time before `ms` (an open pause counts up to `ms`).
  pausedBefore(ms: number): number {
    return this.pauses.reduce((sum, pause) => sum + Math.max(0, Math.min(ms, pause.endMs ?? ms) - pause.startMs), 0);
  }
}

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
  humanFrame: number | null = null;
  state: StateEvent | null = null;
  legacyState = false;
  objective: Of<"objective_update">["objective"] | null = null;
  readonly attempts: Of<"objective_attempt">["attempt"][] = [];
  context: Of<"turn_start">["context"] | null = null;
  // Prompt tokens the server reported for the latest answered request; the
  // turn_start estimate omits the system prompt, tool schemas and images.
  promptTokens: number | null = null;
  disk: { bytes: number; cap_bytes: number; percent: number } | null = null;
  retry: { count: number; attempt: number; limit: number } | null = null;
  tokens = { input: 0, output: 0 };
  readonly latencies: number[] = [];
  lastTps: number | null = null;
  modelErrors = 0;
  toolErrors = 0;
  compactions = 0;
  stuck: { now: number; max: number } | null = null;
  readonly milestones: { name: string; ms: number; seq: number; derived?: boolean; kind?: "story" | "navigation" | "legacy"; origin?: "observed" | "present_at_start"; evidence?: readonly number[]; emulatorFrame?:number }[] = [];
  readonly nativeActions: Of<"native_action">[] = [];
  readonly activities: Of<"activity">[] = [];
  readonly battleChoices: Of<"battle_choice">[] = [];
  readonly presses: Press[] = [];
  readonly thinkingSpans: Span[] = [];
  streaming = { thinking: "", text: "" };
  readonly toolSpans: ToolSpan[] = [];
  readonly errors: ErrorMark[] = [];
  readonly control = new ControlView();
  private readonly openTools = new Map<string, ToolSpan>();
  private routeHome: { state: StateEvent; seq: number } | null = null;
  private routeDeparted = false;
  private routePrevious: { state: StateEvent; seq: number } | null = null;
  private routeResumed = false;

  get isThinking(): boolean {
    return this.thinkingSpans.at(-1)?.endMs === null;
  }

  bySeq(seq: number): RunEvent | undefined {
    return this.events.find((event) => event.seq === seq);
  }

  loopLabel(event: Of<"loop_guard">): string {
    const kinds = { planning: "Planning stall", observation: "Observation stall", ineffective: "Ineffective action", cycle: "Short cycle", rejection: "Repeated rejection" } as const;
    const tool = this.events.findLast((item) => item.seq < event.seq && item.type === "tool_call");
    const elapsed = this.startMs === null ? "elapsed unavailable" : hms((eventMs(event) - this.startMs) / 1000);
    const phase = "mode" in event && event.mode === "diagnostic" ? `diagnostic: ${event.phase.replace("_", " ")}` : event.phase === "supervisor" ? "supervisor message sent to the model" : event.phase;
    const mode = "mode" in event ? event.mode : "historical mode unrecorded";
    return `${kinds[event.kind]} ${phase} · #${String(event.seq)} · turn ${String(event.turn)} · ${elapsed} · ${String(event.calls)} completed calls · preceding tool ${tool?.type === "tool_call" ? tool.name : "not recorded"}: ${event.message} · evidence ${event.evidence.map((seq) => `#${String(seq)}`).join(", ")} · ${mode}`;
  }

  apply(event: RunEvent): void {
    const last = this.events.at(-1);
    if (last !== undefined && event.seq <= last.seq) return;
    this.events.push(event);
    const ms = eventMs(event);
    this.lastMs = ms;
    this.turn = Math.max(this.turn, event.turn);
    switch (event.type) {
      case "operator_control": this.control.apply(event, ms); break;
      case "objective_update": this.objective = event.objective; break;
      case "objective_attempt": this.attempts.push(event.attempt); break;
      case "run_start":
        this.start = event;
        this.startMs = ms;
        this.routeResumed = event.start_state.kind === "save_state";
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
      case "decision_input":
        this.frame=event.frames[0]?.path??this.frame;
        break;
      case "wait_input":break;
      case "human_sample":
        this.frame=event.screenshot.path; this.humanFrame=event.frame;
        break;
      case "human_input":
        if(event.buttons.length>0) this.presses.push({seq:event.seq,ms:event.start_ms,endMs:event.end_ms,buttons:event.buttons,hold:event.end_frame-event.start_frame,release:0,assumed:false,startFrame:event.start_frame,endFrame:event.end_frame});
        break;
      case "button_press":
        this.presses.push({
          seq: event.seq,
          ms,
          buttons: event.buttons,
          hold: event.hold_frames ?? ASSUMED_TIMING.hold_frames,
          release: event.release_frames ?? ASSUMED_TIMING.release_frames,
          assumed: event.hold_frames === undefined,
          ...(event.automatic_running===undefined?{}:{automaticRunning:event.automatic_running}),
          ...(event.walking===undefined?{}:{walking:event.walking}),
        });
        break;
      case "native_action": this.nativeActions.push(event); break;
      case "activity": this.activities.push(event); break;
      case "battle_choice":this.battleChoices.push(event);break;
      case "milestone": {
        // A native route receipt supersedes a provisional replay recovery.
        const recovered = this.milestones.findIndex(mark => mark.name === event.name && mark.derived === true && (/^(?:ROUTE_(?:10[1-4]|115|116)|RUSTURF_TUNNEL|ROXANNE_DEFEATED|PLAYER_HOUSE_EXITED_AFTER_CLOCK|RIVAL_HOUSE_ENTERED|RIVAL_HOUSE_EXITED|PLAYER_BEDROOM)$/.test(mark.name) || (mark.name === "CLOCK_SET" && event.origin !== undefined && event.evidence !== undefined)));
        if(recovered>=0)this.milestones.splice(recovered,1);
        if (!this.milestones.some((m) => m.name === event.name)) this.milestones.push({ name: event.name, ms, seq: event.seq, ...(event.emulator_frame===undefined?{}:{emulatorFrame:event.emulator_frame}), ...(event.kind === undefined ? {} : {kind:event.kind}), ...(event.origin === undefined ? {} : {origin:event.origin}), ...(event.evidence === undefined ? {} : {evidence:event.evidence}) });
        break;
      }
      case "loop_guard":
        this.errors.push({ms,kind:"loop",label:this.loopLabel(event)});
        break;
      case "text_only_supervisor":
        this.errors.push({ ms, kind: "loop", label: `Text-only supervisor ${String(event.note)}/${String(event.limit)} · turn ${String(event.turn)}: ${event.text}` });
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
        this.control.close(ms);
        this.control.state = "ended";
        break;
      case "frames_evicted":
        break;
    }
  }

  contextReadout(): { tokens: number; measured: boolean } | null {
    if (this.promptTokens !== null) return { tokens: this.promptTokens, measured: true };
    return this.context === null ? null : { tokens: this.context.est_tokens, measured: false };
  }

  private onAssistant(event: Of<"assistant">, ms: number): void {
    const span = this.thinkingSpans.at(-1);
    if (span?.endMs === null) span.endMs = ms;
    this.lastThought = { turn: event.turn, thinking: event.thinking, reply: event.text, latencyMs: event.latency_ms };
    this.tokens = { input: this.tokens.input + event.usage.input, output: this.tokens.output + event.usage.output };
    const prompt = event.usage.input + event.usage.cache_read;
    if (prompt > 0) this.promptTokens = prompt;
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
    // Recover the old route-label mismatch only from a confirmed field map.
    // Retain the state receipt and first observation time without editing logs.
    const route = event.location?.match(/^ROUTE ?(101|102|103|104|115|116)$/)?.[1];
    const tunnel = event.location === "RUSTURF TUNNEL" || event.location === "RUSTURF_TUNNEL";
    const laterVisit = route === "115" || route === "116" || tunnel;
    const feature = laterVisit ? "remaining-native-milestones-v1" : "native-progress-activity-v1";
    const qualifiedMap = route !== undefined ? event.map_id?.[0] === 0 && event.map_id[1] === Number(route)-85 : tunnel && event.map_id?.[0] === 24 && event.map_id[1] === 4;
    if (this.start !== null && !this.start.harness_features.includes(feature) && event.started && event.screen === "overworld" && !event.in_battle && qualifiedMap) {
      const name = tunnel ? "RUSTURF_TUNNEL" : `ROUTE_${route ?? ""}`;
      if (!this.milestones.some(mark => mark.name === name)) this.milestones.push({name, ms:eventMs(event), seq:event.seq, derived:true, kind:"navigation", origin:previous === null ? "present_at_start" : "observed", evidence:[event.seq]});
    }
    // Old runs lack the dedicated trainer flag. These two native completion
    // flags are set only by Roxanne's post-victory script, so this is an upper
    // bound at their first recorded observation, not an exact defeat timestamp.
    if (this.start !== null && !this.start.harness_features.includes("native-progress-activity-v1") && event.started && event.screen !== "field_transition" && event.screen !== "unknown" && !event.in_battle && event.story?.roxanne_defeated === undefined && event.story?.rustboro_gym_complete === true && event.story.stone_badge === true && !this.milestones.some(mark => mark.name === "ROXANNE_DEFEATED")) {
      this.milestones.push({ name: "ROXANNE_DEFEATED", ms: eventMs(event), seq: event.seq, derived: true, kind: "story", origin: previous === null || this.start.start_state.kind !== "boot" ? "present_at_start" : "observed", evidence: [event.seq] });
    }
    this.recoverPostClockRoute(event);
    this.state = event;
    const now = event.started && event.position !== null && event.field_controls_locked !== true && previous !== null && samePlace(previous, event) ? (this.stuck?.now ?? 0) + 1 : 0;
    this.stuck = { now, max: Math.max(now, this.stuck?.max ?? 0) };
  }

  private recoverPostClockRoute(event: StateEvent): void {
    if (this.start?.harness_features.includes("probe") === true) return;
    const saved = event.started && event.screen !== "field_transition";
    const stable = saved && event.screen !== "unknown";
    const clock = clockSet(event);
    if (this.routeHome === null) {
      const witnessed = stable && event.story?.clock_set === false && [4, 5].includes(event.story.intro_stage ?? -1) ? houseFamily(event.location, "1F") ?? houseFamily(event.location, "2F") : null;
      const resumedHouse = this.routeResumed && !this.routeDeparted && stable && clock === true ? houseFamily(event.location, "1F") ?? houseFamily(event.location, "2F") : null;
      if (witnessed !== null || resumedHouse !== null) this.routeHome = { state: event, seq: event.seq };
      else if (this.routeResumed && stable && event.location !== null && houseFamily(event.location, "1F") === null && houseFamily(event.location, "2F") === null) this.routeDeparted = true;
    }
    if (stable && clock === true && !this.milestones.some(mark => mark.name === "CLOCK_SET")) {
      this.milestones.push({ name: "CLOCK_SET", ms: eventMs(event), seq: event.seq, derived: true, kind: "story", origin: "observed", evidence: [event.seq] });
    }
    const homeFamily = this.routeHome === null ? null : houseFamily(this.routeHome.state.location, "1F") ?? houseFamily(this.routeHome.state.location, "2F");
    if (stable && homeFamily !== null && houseFamily(event.location, "2F") === homeFamily && !this.milestones.some(mark => mark.name === "PLAYER_BEDROOM")) {
      this.milestones.push({ name: "PLAYER_BEDROOM", ms: eventMs(event), seq: event.seq, derived: true, kind: "navigation", origin: "observed", evidence: [event.seq] });
    }
    const home = this.routeHome === null ? null : routeHomeOf(this.routeHome.state);
    const previous = this.routePrevious;
    if (home !== null && stable && clock === true && !this.milestones.some(mark => mark.name === "RIVAL_HOUSE_ENTERED")) {
      const floor = houseFamily(event.location, "1F");
      if (floor !== null && floor !== home && this.routeHome !== null) this.milestones.push({ name: "RIVAL_HOUSE_ENTERED", ms: eventMs(event), seq: event.seq, derived: true, kind: "navigation", origin: "observed", evidence: [this.routeHome.seq, event.seq] });
    }
    if (home !== null && previous !== null && !this.milestones.some(mark => mark.name === "PLAYER_HOUSE_EXITED_AFTER_CLOCK")) {
      const priorStable = previous.state.started && previous.state.screen !== "field_transition" && previous.state.screen !== "unknown";
      if (priorStable && houseFamily(previous.state.location, "1F") === home && clockSet(previous.state) === true && stable && event.location === "LITTLEROOT TOWN" && clock === true && this.routeHome !== null) {
        this.milestones.push({ name: "PLAYER_HOUSE_EXITED_AFTER_CLOCK", ms: eventMs(event), seq: event.seq, derived: true, kind: "navigation", origin: "observed", evidence: [this.routeHome.seq, previous.seq, event.seq] });
      }
    }
    if (home !== null && previous !== null && this.routeHome !== null && !this.milestones.some(mark => mark.name === "RIVAL_HOUSE_EXITED")) {
      const priorStable = previous.state.started && previous.state.screen !== "field_transition" && previous.state.screen !== "unknown";
      const rival = houseFamily(previous.state.location, "1F");
      const met = (s: StateEvent) => [3, 4].includes(s.story?.rival_stage ?? -1);
      const unmetHome = [0, 1, 2].includes(this.routeHome.state.story?.rival_stage ?? -1);
      if (unmetHome && priorStable && rival !== null && rival !== home && met(previous.state) && stable && event.location === "LITTLEROOT TOWN" && met(event)) {
        this.milestones.push({ name: "RIVAL_HOUSE_EXITED", ms: eventMs(event), seq: event.seq, derived: true, kind: "navigation", origin: "observed", evidence: [this.routeHome.seq, previous.seq, event.seq] });
      }
    }
    if (saved && event.location !== null) this.routePrevious = { state: event, seq: event.seq };
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
