import {isExtensionAction,isTimeExtension} from "./budget-extensions.js";
import {PROGRESS_CATALOG, EXTENDED_PROGRESS_NAMES, OPTIONAL_PROGRESS_NAMES, CAMPAIGN_ADDITION_NAMES, CAMPAIGN_PROGRESS_FEATURE, progressReached, STORY_PROGRESS_FEATURE} from "./story-progress.js";
import { roxanneFirstInteraction } from "./roxanne-interaction.js";
// A run's events folded into what the panels show. Shared by the browser and
// tests; it imports only types from the agent's schema.
import type { RunEvent } from "@pokebench/agent/events";
import { eventMs, hms, num } from "./format.js";

// drought-battle-heal-hold-v1: the message prefix of a held drought briefing (packages/agent/src/stall-briefing.ts).
export const RETIRED_VISIBILITY = {id:"player-map-visibility-v1",label:"PLAYER MAP VISIBILITY V1 (RETIRED)",description:"Historical screen-limited visibility, removed after a connected-map identity bug. Recorded settings and replay remain available; this behavior cannot be enabled or reconstructed by the current harness."} as const;

const HELD_DROUGHT = "Not sent (drought-battle-heal-hold-v1): ";
const HELD_FIRST_VISIT = "Not sent (first-visit-cycle-credit-v1): ";
const FACTUAL_DROUGHT = "Not sent (drought-progress-facts-v1): ";
const SUPPRESSED_DROUGHT = "Not sent (milestone-drought-suppression-v1): ";

type Of<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;
export type RunStartEvent = Of<"run_start">;
export type RunEndEvent = Of<"run_end">;
type AnyStateEvent = Of<"state">;
export type StateEvent = Extract<AnyStateEvent, { started: boolean }>;
// Shared by the live-head bootstrap and panel reducer: an unread transition is
// not an empty roster; a known pregame screen can genuinely clear the party.
function pregameState(event: StateEvent): boolean {
  return !event.started && ["intro", "title", "main_menu", "birch_speech", "naming"].includes(event.screen);
}
export function hasPartySample(event: StateEvent): boolean {
  return pregameState(event) || event.party.length > 0 ||
    (!event.in_battle && !["battle", "field_transition", "unknown"].includes(event.screen) && event.play_time_s !== null);
}
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
  clock_step: true,
  server_exit: true,
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
  belief_ledger:true,
  milestone_hint:true,
  guide_purchase_missed:true,
  model_stream:true,
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
  low_hp_trainer_warning: true,
  people_id_card: true,
  loop_breaker: true,
  stall_gate: true,
  unfinished_activity: true,
  trainer_sight_check: true,
  story_battle_heal_gate: true,
  heal_first_line: true,
  auto_talk: true,
  story_battle_warning: true,
  heal_before_trainers_warning: true,
  gym_heal_warning: true,
  dark_area_flash_reminder: true,
  story_goal_away: true,
  destination_citation: true,
  dialogue_auto_advance: true,
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

export const MILESTONE_ORDER = ["GAME_RUNNING", "NEW_GAME_CREATED", "PLAYER_NAME_CONFIRMED", "PLAYER_NAME_SET", "FIRST_TRUCK_EXIT", "INTRO_CUTSCENE_COMPLETE", "LITTLEROOT_TOWN", "PLAYER_HOUSE_ENTERED", "MOM_CLOCK_INSTRUCTION", "PLAYER_BEDROOM", "CLOCK_SET", "PLAYER_BEDROOM_EXITED_AFTER_CLOCK", "MOM_RIVAL_INSTRUCTION", "PLAYER_HOUSE_EXITED_AFTER_CLOCK", "RIVAL_HOUSE_ENTERED", "RIVAL_BEDROOM_REACHED", "RIVAL_MET", "RIVAL_HOUSE_EXITED", "BIRCH_RESCUE_REQUESTED", "ROUTE_101", "STARTER_CHOSEN", "BIRCH_RESCUE_COMPLETE", "BIRCH_STARTER_HANDOFF_COMPLETE", "ROUTE_101_AFTER_HANDOFF", "OLDALE_TOWN", "ROUTE_103", "RIVAL_BATTLE_STARTED", "RIVAL_BATTLE_DEFEATED", "RIVAL_BATTLE_WON", "RIVAL_OLDALE_SEND_OFF", "ROUTE_101_AFTER_RIVAL_BATTLE", "LITTLEROOT_AFTER_RIVAL_BATTLE", "RECEIVED_POKEDEX", "STARTER_TUTORIAL_COMPLETE", "RUNNING_SHOES_RECEIVED", "FIRST_POKEMON_CAUGHT", "FIRST_EVOLUTION", "FIRST_POKECENTER_HEAL", "ROUTE_102", "ROUTE_102_TRAINER_CALVIN_DEFEATED", "ROUTE_102_TRAINER_RICK_DEFEATED", "ROUTE_102_TRAINER_TIANA_DEFEATED", "ROUTE_102_TRAINER_ALLEN_DEFEATED", "PETALBURG_CITY", "DAD_FIRST_MEETING", "WALLY_TUTORIAL_COMPLETE", "ROUTE_104", "ROUTE_104_TRAINER_IVAN_DEFEATED", "ROUTE_104_TRAINER_BILLY_DEFEATED", "ROUTE_104_TRAINER_HALEY_DEFEATED", "ROUTE_104_TRAINER_WINSTON_DEFEATED", "ROUTE_104_TRAINER_CINDY_DEFEATED", "ROUTE_104_TRAINER_GINA_MIA_DEFEATED", "ROUTE_104_TRAINER_DARIAN_DEFEATED", "PETALBURG_WOODS", "PETALBURG_WOODS_TRAINER_LYLE_DEFEATED", "PETALBURG_WOODS_TRAINER_JAMES_DEFEATED", "PETALBURG_WOODS_TRAINER_AQUA_GRUNT_DEFEATED", "TEAM_AQUA_WOODS_EVENT_COMPLETE", "RUSTBORO_CITY", "ROUTE_115", "ROUTE_116", "ROUTE_116_TRAINER_JOEY_DEFEATED", "ROUTE_116_TRAINER_JOSE_DEFEATED", "ROUTE_116_TRAINER_JERRY_DEFEATED", "ROUTE_116_TRAINER_CLARK_DEFEATED", "ROUTE_116_TRAINER_JANICE_DEFEATED", "ROUTE_116_TRAINER_KAREN_DEFEATED", "ROUTE_116_TRAINER_SARAH_DEFEATED", "ROUTE_116_TRAINER_DAWSON_DEFEATED", "ROUTE_116_TRAINER_DEVAN_DEFEATED", "ROUTE_116_TRAINER_JOHNSON_DEFEATED", "RUSTURF_TUNNEL", "RUSTBORO_CITY_GYM", "RUSTBORO_GYM_TRAINER_JOSH_DEFEATED", "RUSTBORO_GYM_TRAINER_TOMMY_DEFEATED", "RUSTBORO_GYM_TRAINER_MARC_DEFEATED", "ROXANNE_FIRST_INTERACTION", "ROXANNE_DEFEATED", "RUSTBORO_GYM_COMPLETE", "STONE_BADGE", "ROCK_TOMB_RECEIVED", ...EXTENDED_PROGRESS_NAMES] as const;

// Mirrors the agent's DEPTH_ORDER (model.test.ts checks it); the page cannot import the agent package.
const ACTIVITY_MILESTONES = OPTIONAL_PROGRESS_NAMES;
export const DEPTH_ORDER: readonly string[] = MILESTONE_ORDER.filter((name) => !ACTIVITY_MILESTONES.has(name));
export function deeperMilestone(current: string | null, candidate: string): string | null {
  const depth = DEPTH_ORDER.indexOf(candidate);
  return depth >= 0 && (current === null || depth >= DEPTH_ORDER.indexOf(current)) ? candidate : current;
}

export type ControlState = "running" | "pause_pending" | "paused" | "stop_pending" | "ended";

// Operator control as recorded by the agent (operator_control events).
export class ControlView {
  maxWallMs: number | null = null;
  maxTurns: number | null = null;
  lastExtensionRequest: number | null = null;
  state: ControlState = "running";
  emulatorFrozen: boolean | null = null;
  readonly pauses: { startMs: number; endMs: number | null }[] = [];

  apply(event: Of<"operator_control">, ms: number): void {
    if (isExtensionAction(event.action)) {
      if(event.status==="applied" && !isTimeExtension(event.action) && event.max_turns!==undefined){this.maxTurns=event.max_turns;this.lastExtensionRequest=event.request;}
      if (event.status === "applied" && isTimeExtension(event.action) && event.max_wall_ms !== undefined) {
        this.maxWallMs = event.max_wall_ms;
        this.lastExtensionRequest = event.request;
      }
      return;
    }
    if (event.status === "ignored" || event.status === "failed") return;
    if (event.status === "pending") {
      this.state = event.action === "pause" ? "pause_pending" : "stop_pending";
      return;
    }
    if (event.action === "pause") {
      this.state = "paused";
      this.emulatorFrozen = event.emulator_frozen ?? null;
      this.pauses.push({ startMs: ms - (event.freeze_wait_ms ?? 0), endMs: null });
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

export interface RequestSample {
  readonly seq: number;
  readonly ms: number;
  readonly ttftMs: number | null;
  readonly inferenceMs: number;
  readonly output: number;
  readonly input: number;
  readonly cacheRead: number;
  readonly cacheWrite: number | null;
  readonly failed: boolean;
}

export class RunView {
  operatorTurnLimit:number|null=null;
  get effectiveTurnLimit():number|null { const values=[this.control.maxTurns,this.operatorTurnLimit,this.start?.budgets.max_turns].filter((n):n is number=>typeof n==="number"); return values.length===0?null:Math.max(...values); }
  readonly requestSamples: RequestSample[] = [];
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
  partyState: StateEvent | null = null;
  cardState: Pick<StateEvent, "name" | "location" | "party"> | null = null;
  // Viewer-only overlay; roster/profile and raw event provenance stay in partyState.
  partyHealth: { source: StateEvent; party: StateEvent["party"]; slots: number[] } | null = null;
  get partyMembers(): StateEvent["party"] { return this.partyHealth?.party ?? this.partyState?.party ?? []; }

  private updatePartyHealth(event: StateEvent): void {
    if (this.partyState === event) this.partyHealth = null;
    const roster = this.partyState, battle = event.battle;
    if (roster === null || !event.in_battle || battle?.active !== true || !battle.initialized || battle.phase === "unavailable"
      || (event.party_owner ?? "player") !== (roster.party_owner ?? "player")) return;
    const players = (battle.battlers ?? []).filter(mon => (mon.position & 1) === 0 && !mon.absent);
    const slots: number[] = [];
    const party = this.partyMembers.map((mon, slot) => {
      // gBattlerPartyIndexes identifies the slot; personality:OT identity prevents
      // applying an opponent, tutorial rental or old occupant.
      const matches = players.filter(b => b.party_slot === slot);
      const b = matches.length === 1 ? matches[0] : undefined;
      if (b === undefined || mon.identity == null || mon.identity === "" || b.identity !== mon.identity
        || roster.party.filter(m => m.identity === mon.identity).length !== 1
        || !Number.isInteger(b.hp) || !Number.isInteger(b.max_hp) || b.max_hp <= 0 || b.max_hp > 65535 || b.hp < 0 || b.hp > b.max_hp
        || !Number.isInteger(b.status1) || b.status1 < 0 || b.status1 > 0xfff) return mon;
      slots.push(slot);
      return { ...mon, hp: b.hp, max_hp: b.max_hp, status: b.status1 };
    });
    // Matching current party samples already have this provenance; no overlay needed.
    if (slots.length > 0 && (roster !== event || party.some((m, i) => { const old = roster.party.at(i); return old === undefined || m.hp !== old.hp || m.max_hp !== old.max_hp || m.status !== old.status; }))) {
      this.partyHealth = { source: event, party, slots };
    }
  }

  legacyState = false;
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
  private roxanneNegativeBaseline = false;
  readonly milestones: { name: string; ms: number; seq: number; derived?: boolean; kind?: "story" | "navigation" | "legacy"; origin?: "observed" | "present_at_start"; evidence?: readonly number[]; emulatorFrame?:number; screenshotEvidence?: readonly {seq:number;path:string;sha1:string}[] }[] = [];
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
  private labWitness: number | null = null;
  private labPrevious: { state: StateEvent; seq: number } | null = null;
  private bedroomPrevious: { state: StateEvent; seq: number } | null = null;
  private rivalWitness: number | null = null;
  private rivalPrevious: { state: StateEvent; seq: number } | null = null;
  private rivalBaseline = new Set<string>();
  private battleSettled: { state: StateEvent; seq: number } | null = null;

  get isThinking(): boolean {
    return this.thinkingSpans.at(-1)?.endMs === null;
  }

  bySeq(seq: number): RunEvent | undefined {
    return this.events.find((event) => event.seq === seq);
  }

  loopLabel(event: Of<"loop_guard">): string {
    const kinds = { planning: "Planning stall", observation: "Observation stall", ineffective: "Ineffective action", cycle: "Short cycle", rejection: "Repeated rejection", trigger_script:"Repeated trigger script", map_cycle: "Map back-and-forth", milestone_drought: "Milestone drought", interface_dwell: "Interface dwell", same_plan: "Same plan repeated", open_milestone: "Open leader loss", same_target_no_progress: "Same target, no progress" } as const;
    const tool = this.events.findLast((item) => item.seq < event.seq && item.type === "tool_call");
    const elapsed = this.startMs === null ? "elapsed unavailable" : hms((eventMs(event) - this.startMs) / 1000);
    const phase = "mode" in event && event.mode === "diagnostic" ? `diagnostic: ${event.phase.replace("_", " ")}` : event.phase === "supervisor" ? "supervisor message sent to the model" : event.phase;
    const mode = "mode" in event ? event.mode : "historical mode unrecorded";
    return `${kinds[event.kind]} ${phase} · #${String(event.seq)} · turn ${String(event.turn)} · ${elapsed} · ${String(event.calls)} completed calls · preceding tool ${tool?.type === "tool_call" ? tool.name : "not recorded"}: ${event.message} · evidence ${event.evidence.map((seq) => `#${String(seq)}`).join(", ")} · ${mode}`;
  }

  // For a one-pass reader that needs only the folded results: a long log's raw events exceed a worker's heap.
  releaseEvents(): void {
    this.events.splice(0, this.events.length - 1);
  }

  // Drops finished history before `ms`; milestones stay, because they guard against repeats.
  forgetBefore(ms: number): void {
    const keep = <T>(items: T[], recent: (item: T) => boolean): void => { items.splice(0, items.length, ...items.filter(recent)); };
    keep(this.events, event => eventMs(event) >= ms);
    keep(this.thinkingSpans, span => span.endMs === null || span.endMs >= ms);
    keep(this.toolSpans, span => span.endMs === null || span.endMs >= ms);
    keep(this.presses, press => (press.endMs ?? press.ms) >= ms);
    keep(this.nativeActions, action => action.server_timestamp * 1000 >= ms);
    keep(this.errors, mark => mark.ms >= ms);
    keep(this.requestSamples, sample => sample.ms >= ms);
    keep(this.activities, activity => eventMs(activity) >= ms);
    keep(this.battleChoices, choice => eventMs(choice) >= ms);
    keep(this.control.pauses, pause => pause.endMs === null || pause.endMs >= ms);
    this.latencies.length = 0;
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
        const gated = PROGRESS_CATALOG.find(m => m.name === event.name)?.prerequisites !== undefined;
        if (gated && (this.state === null || event.evidence?.at(-1) !== this.state.seq || progressReached(event.name, this.state) !== true)) break;
        // A native route receipt supersedes a provisional replay recovery.
        const recovered = this.milestones.findIndex(mark => mark.name === event.name && mark.derived === true && (gated || /^(?:ROUTE_(?:10[1-4]|115|116)|RUSTURF_TUNNEL|ROXANNE_FIRST_INTERACTION|ROXANNE_DEFEATED|PLAYER_HOUSE_EXITED_AFTER_CLOCK|RIVAL_HOUSE_ENTERED|RIVAL_HOUSE_EXITED|ROUTE_101_AFTER_HANDOFF|PLAYER_BEDROOM_EXITED_AFTER_CLOCK|ROUTE_101_AFTER_RIVAL_BATTLE|LITTLEROOT_AFTER_RIVAL_BATTLE|RIVAL_BATTLE_STARTED|RIVAL_BATTLE_DEFEATED|RIVAL_OLDALE_SEND_OFF|PLAYER_BEDROOM)$/.test(mark.name) || (mark.name === "CLOCK_SET" && event.origin !== undefined && event.evidence !== undefined)));
        if(recovered>=0)this.milestones.splice(recovered,1);
        if (!this.milestones.some((m) => m.name === event.name)) this.milestones.push({ name: event.name, ms, seq: event.seq, ...(event.emulator_frame===undefined?{}:{emulatorFrame:event.emulator_frame}), ...(event.kind === undefined ? {} : {kind:event.kind}), ...(event.origin === undefined ? {} : {origin:event.origin}), ...(event.evidence === undefined ? {} : {evidence:event.evidence}) });
        break;
      }
      case "loop_guard":
        // same-target-no-progress-v1 stays off the closed timeline (operator decision 2026-10-16), and so do the drought
        // briefings drought-battle-heal-hold-v1 held (Activity History and the inspector only).
        if (event.kind !== "same_target_no_progress" && !event.message.startsWith(HELD_DROUGHT) && !event.message.startsWith(HELD_FIRST_VISIT) && !(event.kind === "milestone_drought" && "mode" in event && event.mode === "diagnostic" && event.phase === "would_warn" && (event.message.startsWith(SUPPRESSED_DROUGHT) || event.message.startsWith(FACTUAL_DROUGHT)))) this.errors.push({ms,kind:"loop",label:this.loopLabel(event)});
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
    this.requestSamples.push({ seq: event.seq, ms, ttftMs: event.ttft_ms,
      inferenceMs: event.latency_ms, output: event.usage.output, input: event.usage.input,
      cacheRead: event.usage.cache_read, cacheWrite: event.usage.cache_write ?? null, failed: event.stop_reason === "error" || event.stop_reason === "aborted" });
    const span = this.thinkingSpans.at(-1);
    if (span?.endMs === null) span.endMs = ms;
    this.lastThought = { turn: event.turn, thinking: event.thinking, reply: event.text, latencyMs: event.latency_ms };
    this.tokens = { input: this.tokens.input + event.usage.input, output: this.tokens.output + event.usage.output };
    const prompt = event.usage.input + event.usage.cache_read + (event.usage.cache_write ?? 0);
    if (prompt > 0) this.promptTokens = prompt;
    if (event.stop_reason === "error") {
      this.modelErrors += 1;
      this.errors.push({ ms, kind: "model", label: `model error: ${event.error ?? "unknown"}` });
      return;
    }
    this.latencies.push(event.latency_ms);
    this.lastTps = event.latency_ms > 0 ? event.usage.output / (event.latency_ms / 1000) : null;
  }

  // Events were lost, so nothing will close what was open; end it where the record stops.
  sealOpen(ms: number): void {
    this.closeOpenSpans(ms);
    this.control.close(ms);
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
    // game_state.py PRE_GAME: an unread field transition can also have started=false.
    if (hasPartySample(event)) this.partyState = event;
    this.updatePartyHealth(event);
    const reset = pregameState(event);
    this.cardState = {
      name: reset ? event.name : event.name ?? this.cardState?.name ?? null,
      location: reset ? event.location : event.location ?? this.cardState?.location ?? null,
      party: this.partyMembers,
    };
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
    const roxanneInteraction = roxanneFirstInteraction(event);
    if (roxanneInteraction === false) this.roxanneNegativeBaseline = true;
    if (this.start !== null && !this.start.harness_features.includes("roxanne-first-interaction-v1") && roxanneInteraction === true && !this.milestones.some(mark => mark.name === "ROXANNE_FIRST_INTERACTION")) {
      this.milestones.push({name:"ROXANNE_FIRST_INTERACTION",ms:eventMs(event),seq:event.seq,derived:true,kind:"story",origin:this.start.start_state.kind === "boot" || this.roxanneNegativeBaseline ? "observed" : "present_at_start",evidence:[event.seq]});
    }
    this.recoverPostClockRoute(event);
    this.recoverRoute101Return(event);
    this.recoverBedroomExit(event);
    this.recoverRivalReturn(event);
    this.recoverRivalBattle(event);
    this.recoverExtendedProgress(event);
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
      const visitedRival = [2, 3, 4].includes(previous.state.story?.rival_stage ?? -1);
      if (priorStable && !visitedRival && houseFamily(previous.state.location, "1F") === home && clockSet(previous.state) === true && stable && event.location === "LITTLEROOT TOWN" && clock === true && this.routeHome !== null) {
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

  // Mirrors the tracker's ROUTE_101_AFTER_HANDOFF proof: a settled pre-handoff state (Birch lab state 0-2),
  // then a settled Littleroot or Oldale state and a settled Route 101 state, both at lab state 3-5.
  private recoverRoute101Return(event: StateEvent): void {
    // Only logs from before the split: a run whose recorder declares it must carry the native event.
    if (this.start?.harness_features.includes("probe") === true || this.start?.harness_features.includes("route-101-after-handoff-v1") === true) return;
    const settled = event.started && event.screen !== "field_transition" && !event.screen.startsWith("unknown") && event.location !== null;
    if (!settled) return;
    const lab = event.story?.birch_lab_stage ?? -1;
    const handedOff = (s: StateEvent) => [3, 4, 5].includes(s.story?.birch_lab_stage ?? -1);
    const previous = this.labPrevious;
    if (this.labWitness !== null && previous !== null && handedOff(event) && /^ROUTE ?101$/.test(event.location ?? "") && handedOff(previous.state)
      && (previous.state.location === "LITTLEROOT TOWN" || previous.state.location === "OLDALE TOWN") && !this.milestones.some(mark => mark.name === "ROUTE_101_AFTER_HANDOFF")) {
      this.milestones.push({ name: "ROUTE_101_AFTER_HANDOFF", ms: eventMs(event), seq: event.seq, derived: true, kind: "navigation", origin: "observed", evidence: [this.labWitness, previous.seq, event.seq] });
    }
    if ([0, 1, 2].includes(lab)) this.labWitness = event.seq;
    this.labPrevious = { state: event, seq: event.seq };
  }

  // Mirrors the tracker's PLAYER_BEDROOM_EXITED_AFTER_CLOCK proof: the last settled 2F state at intro state 6
  // with the clock set, then a settled state on the same family's 1F with the clock set.
  private recoverBedroomExit(event: StateEvent): void {
    if (this.start?.harness_features.includes("probe") === true || this.start?.harness_features.includes("bedroom-exit-v1") === true) return;
    const settled = event.started && event.screen !== "field_transition" && !event.screen.startsWith("unknown") && event.location !== null;
    if (!settled) return;
    const previous = this.bedroomPrevious;
    const room = previous === null ? null : houseFamily(previous.state.location, "2F");
    if (previous !== null && room !== null && previous.state.story?.intro_stage === 6 && clockSet(previous.state) === true
      && houseFamily(event.location, "1F") === room && clockSet(event) === true && !this.milestones.some(mark => mark.name === "PLAYER_BEDROOM_EXITED_AFTER_CLOCK")) {
      this.milestones.push({ name: "PLAYER_BEDROOM_EXITED_AFTER_CLOCK", ms: eventMs(event), seq: event.seq, derived: true, kind: "navigation", origin: "observed", evidence: [previous.seq, event.seq] });
    }
    this.bedroomPrevious = { state: event, seq: event.seq };
  }

  // Mirrors the tracker's reader splits for runs that predate route103-rival-splits-v1, from values the
  // backfill recovered from raw RAM: each needs an in-run false before its first true, and the send-off
  // needs Oldale rival state 1 then 2 on two settled Oldale states.
  private readonly progressNegative = new Set<string>();
  private recoverExtendedProgress(event:StateEvent):void {
    if(this.start===null||this.start.harness_features.includes("probe"))return;
    for(const m of PROGRESS_CATALOG) {
      if(m.prerequisites===undefined&&this.start.harness_features.includes(CAMPAIGN_ADDITION_NAMES.has(m.name)?CAMPAIGN_PROGRESS_FEATURE:STORY_PROGRESS_FEATURE))continue;
      if(!EXTENDED_PROGRESS_NAMES.has(m.name)||this.milestones.some(mark=>mark.name===m.name))continue;
      const value=progressReached(m.name,event);
      if(value===false)this.progressNegative.add(m.name);
      if(value===true)this.milestones.push({name:m.name,ms:eventMs(event),seq:event.seq,derived:true,kind:m.map===undefined?"story":"navigation",origin:this.start.start_state.kind==="boot"||this.progressNegative.has(m.name)?"observed":"present_at_start",evidence:[event.seq]});
    }
  }

  private recoverRivalBattle(event: StateEvent): void {
    if (this.start?.harness_features.includes("probe") === true || this.start?.harness_features.includes("route103-rival-splits-v1") === true) return;
    const rival = event.route103_rival;
    if (event.started && event.screen !== "field_transition" && rival != null) {
      for (const [name, reached] of [["RIVAL_BATTLE_STARTED", rival.battle_active], ["RIVAL_BATTLE_DEFEATED", rival.defeated]] as const) {
        if (!reached) this.rivalBaseline.add(name);
        else if (this.rivalBaseline.has(name) && !this.milestones.some(mark => mark.name === name)) this.milestones.push({ name, ms: eventMs(event), seq: event.seq, derived: true, kind: "story", origin: "observed", evidence: [event.seq] });
      }
    }
    const settled = event.started && event.screen !== "field_transition" && !event.screen.startsWith("unknown") && event.location !== null;
    if (!settled) return;
    const previous = this.battleSettled;
    if (previous !== null && previous.state.location === "OLDALE TOWN" && previous.state.route103_rival?.oldale_stage === 1 && event.location === "OLDALE TOWN" && rival?.oldale_stage === 2 && !this.milestones.some(mark => mark.name === "RIVAL_OLDALE_SEND_OFF")) {
      this.milestones.push({ name: "RIVAL_OLDALE_SEND_OFF", ms: eventMs(event), seq: event.seq, derived: true, kind: "story", origin: "observed", evidence: [previous.seq, event.seq] });
    }
    this.battleSettled = { state: event, seq: event.seq };
  }

  // Mirrors the tracker's return-trip proofs: a settled pre-battle state (Birch lab state 0-3), then
  // Oldale → Route 101 and Route 101 → Littleroot, both settled at lab state 4.
  private recoverRivalReturn(event: StateEvent): void {
    if (this.start?.harness_features.includes("probe") === true || this.start?.harness_features.includes("route103-rival-splits-v1") === true) return;
    const settled = event.started && event.screen !== "field_transition" && !event.screen.startsWith("unknown") && event.location !== null;
    if (!settled) return;
    const lab = event.story?.birch_lab_stage ?? -1;
    const previous = this.rivalPrevious;
    const route = (s: StateEvent) => /^ROUTE ?101$/.test(s.location ?? "");
    if (this.rivalWitness !== null && previous !== null && lab === 4 && previous.state.story?.birch_lab_stage === 4) {
      const legs = [["ROUTE_101_AFTER_RIVAL_BATTLE", previous.state.location === "OLDALE TOWN" && route(event)], ["LITTLEROOT_AFTER_RIVAL_BATTLE", route(previous.state) && event.location === "LITTLEROOT TOWN"]] as const;
      for (const [name, matched] of legs) if (matched && !this.milestones.some(mark => mark.name === name)) this.milestones.push({ name, ms: eventMs(event), seq: event.seq, derived: true, kind: "navigation", origin: "observed", evidence: [this.rivalWitness, previous.seq, event.seq] });
    }
    const unbeaten = event.route103_rival == null ? !/^ROUTE ?103$/.test(event.location ?? "") : !event.route103_rival.battle_active && !event.route103_rival.defeated;
    if ([0, 1, 2, 3].includes(lab) && !event.in_battle && unbeaten) this.rivalWitness = event.seq;
    this.rivalPrevious = { state: event, seq: event.seq };
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
