// AGENT TRACE: every event ACTIVITY HISTORY showed, grouped by turn into
// uniform rows. A tool call carries its press, wait and result.
import type { RunEvent } from "@pokebench/agent/events";
import { esc, eventMs, hms, num } from "./format.js";
import { eventText } from "./panels.js";

type Of<T extends RunEvent["type"]> = Extract<RunEvent, { type: T }>;

export type TraceCategory = "think" | "act" | "sup" | "guard" | "ms" | "mem" | "eng" | "err" | "run";

export const TRACE_CHIPS: readonly { readonly id: TraceCategory; readonly label: string; readonly on: boolean }[] = [
  { id: "think", label: "THINKING", on: true },
  { id: "act", label: "ACTIONS", on: true },
  { id: "sup", label: "SUPERVISOR", on: true },
  { id: "guard", label: "LOOP GUARD", on: true },
  { id: "ms", label: "MILESTONES", on: true },
  { id: "mem", label: "MEMORY", on: true },
  { id: "eng", label: "EMULATOR", on: false },
  { id: "err", label: "ERRORS", on: true },
  { id: "run", label: "RUN", on: true },
];

const SIDE: ReadonlySet<TraceCategory> = new Set(["think", "act", "sup", "guard", "ms", "err"]);

export const STAR_SVG = '<svg class="star" viewBox="0 0 16 16" width="11" height="11" aria-label="milestone" role="img"><path d="M8 .9l2.2 4.6 5 .7-3.6 3.5.9 5L8 12.3l-4.5 2.4.9-5L.8 6.2l5-.7z" fill="currentColor"/></svg>';

export interface TraceStep {
  readonly key: number;
  readonly seqs: readonly number[];
  readonly kind: RunEvent["type"];
  readonly category: TraceCategory;
  readonly iconHtml: string;
  readonly tone: string;
  readonly titleHtml: string;
  readonly summaryHtml: string;
  // Plain text; traceRow escapes it.
  readonly desc: string;
  readonly status: "error" | "warn" | null;
  readonly body: string | null;
}

// Events the trace leaves to their own panels (the same ones ACTIVITY HISTORY skipped).
const PANEL_ONLY = new Set<RunEvent["type"]>(["run_start", "turn_start", "state", "assistant_delta", "human_input", "human_sample"]);
export const showsInTrace = (event: RunEvent): boolean => !PANEL_ONLY.has(event.type);

class Entry {
  readonly events: RunEvent[];
  readonly category: TraceCategory;
  private cached: TraceStep | null = null;
  private row: string | null = null;
  constructor(first: RunEvent, readonly label: string | null = null) {
    this.events = [first];
    this.category = categoryOf(first);
  }

  push(event: RunEvent): void {
    this.events.push(event);
    this.cached = null;
    this.row = null;
  }

  // Built once per change: a long run rerenders without re-escaping old results.
  step(): TraceStep {
    this.cached ??= describe(this);
    return this.cached;
  }

  // Keep only the row: the step's body would hold a second copy of the result text.
  html(): string {
    if (this.row === null) {
      this.row = traceRow(this.step());
      this.cached = null;
    }
    return this.row;
  }

  // The side panel's copy, with its turn gutter. Not cached: it is rebuilt only when its turn changes,
  // and caching it would hold a second copy of every result.
  sideHtml(gutter: string): string {
    return traceRow(this.cached ?? describe(this), gutter);
  }

  // Changes exactly when this entry's row would.
  get stamp(): string {
    return `${String(this.events[0]?.seq)}:${String(this.events.length)}`;
  }
}

export class TraceTurn {
  readonly entries: Entry[] = [];
  constructor(readonly turn: number, readonly ms: number) {}
  inputTokens: number | null = null;

  steps(): TraceStep[] {
    return this.entries.map((entry) => entry.step());
  }
}

export class TraceBuilder {
  readonly turns: TraceTurn[] = [];
  readonly counts = Object.fromEntries(TRACE_CHIPS.map((chip) => [chip.id, 0])) as Record<TraceCategory, number>;
  version = 0;
  private readonly tools = new Map<string, Entry>();

  // The viewer's loop-guard attribution (preceding tool, elapsed) is computed once, when the event arrives.
  constructor(private readonly loopLabel?: (event: Of<"loop_guard">) => string) {}

  add(event: RunEvent): void {
    if (!showsInTrace(event)) return;
    this.version += 1;
    const owner = this.ownerOf(event);
    if (owner !== undefined) {
      owner.push(event);
      if (event.type === "tool_result") this.tools.delete(event.id);
      return;
    }
    let turn = this.turns.at(-1);
    if (turn?.turn !== event.turn) {
      turn = this.turns.find((t) => t.turn === event.turn) ?? this.insert(new TraceTurn(event.turn, eventMs(event)));
    }
    const entry = new Entry(event, event.type === "loop_guard" && this.loopLabel !== undefined ? this.loopLabel(event) : null);
    if (event.type === "tool_call") this.tools.set(event.id, entry);
    if (event.type === "assistant") turn.inputTokens = event.usage.input;
    turn.entries.push(entry);
    this.counts[entry.category] += 1;
  }

  private ownerOf(event: RunEvent): Entry | undefined {
    if (event.type === "button_press" || event.type === "wait_input") return this.tools.get(event.tool_call_id);
    if (event.type === "tool_result") return this.tools.get(event.id);
    return undefined;
  }

  private insert(turn: TraceTurn): TraceTurn {
    const at = this.turns.findIndex((t) => t.turn > turn.turn);
    if (at < 0) this.turns.push(turn);
    else this.turns.splice(at, 0, turn);
    return turn;
  }
}

const ARROW: Readonly<Record<string, string>> = { UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→" };
const chip = (button: string): string => `<span class="chipb">${ARROW[button] ?? ""}${esc(button)}</span>`;
// One-line summaries are clipped by CSS anyway; the full text stays in the body and the inspector.
const firstLine = (text: string): string => (text.trim().split("\n")[0] ?? "").slice(0, 300);
const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const LOOP_KIND = { planning: "planning", observation: "observation", ineffective: "ineffective", cycle: "cycle", rejection: "rejection", trigger_script:"repeated trigger script", map_cycle: "map back-and-forth", milestone_drought: "milestone drought", interface_dwell: "interface dwell", same_plan: "same plan repeated" } as const;
const NATIVE_ICON: Readonly<Record<string, readonly [string, string]>> = {
  native_input: ["IN", "engine"], menu_changed: ["MNU", "engine"], harness_bug: ["BUG", "error"],
  battle_signal: ["VS", "battle"], battle_started: ["VS", "battle"], battle_ended: ["VS", "battle"], battle_outcome: ["VS", "battle"],
  pokemon_acquired: ["NEW", "gold"], pokemon_captured: ["NEW", "gold"],
};
const RUN_LABEL: Readonly<Partial<Record<RunEvent["type"], readonly [string, string]>>> = {
  operator_control: ["CTL", "Operator control"], objective_update: ["OBJ", "Objective updated"], objective_attempt: ["OBJ", "Objective attempt"],
  disk_usage: ["HDD", "Disk usage"], frames_evicted: ["HDD", "Frames evicted"], run_end: ["END", "Run ended"],
  compaction: ["CMP", "Context compacted"], navigation_context: ["MEM", "Navigation memory delivered"], ledger_context: ["MEM", "Instruction ledger delivered"], belief_ledger: ["MEM", "Disproved beliefs delivered"],
  milestone_hint: ["MEM", "Milestone hint sent"], decision_input: ["SNP", "Decision snapshot"], battle_choice: ["VS", "Battle choice"],
  activity: ["ACT", "Activity"], retry: ["↻", "Retry"], text_only_supervisor: ["SUP", "Text-only supervisor"], low_hp_trainer_warning: ["SUP", "Low-HP trainer warning"], people_id_card: ["ID", "ID card shown"], loop_breaker: ["SUP", "Loop breaker"], stall_gate: ["SUP", "Stall briefing held"], story_battle_warning: ["SUP", "Story battle warning"], story_goal_away: ["SUP", "Story goal walk-away"], destination_citation: ["NAV", "Destination citation"], heal_before_trainers_warning: ["SUP", "Heal before trainers warning"], dialogue_auto_advance: ["DLG", "Dialogue auto-advanced"], telemetry_error: ["!", "Telemetry error"],
  button_press: ["BTN", "Press"], tool_result: ["RES", "Tool result"], wait_input: ["WAIT", "Wait"],
};
const MEMORY = new Set<RunEvent["type"]>(["navigation_context", "ledger_context", "belief_ledger", "milestone_hint", "decision_input", "compaction"]);
const ACTION = new Set<RunEvent["type"]>(["battle_choice", "objective_attempt", "button_press", "tool_result", "wait_input", "dialogue_auto_advance"]);

function categoryOf(event: RunEvent): TraceCategory {
  switch (event.type) {
    case "assistant": return "think";
    case "tool_call": return "act";
    case "loop_guard": return event.phase === "supervisor" ? "sup" : "guard";
    case "text_only_supervisor": return "sup";
    case "low_hp_trainer_warning": return "sup";
    case "people_id_card": return "act";
    case "loop_breaker": return "sup";
    case "stall_gate": return "guard";
    case "story_battle_warning": return "sup";
    case "heal_before_trainers_warning": return "sup";
    case "story_goal_away": return "sup";
    case "destination_citation": return "act";
    case "milestone": return "ms";
    // A harness bug is a diagnostic, so it stays visible with the errors, not behind EMULATOR.
    case "native_action": return event.kind === "harness_bug" ? "err" : "eng";
    case "retry": case "telemetry_error": return "err";
    default: return MEMORY.has(event.type) ? "mem" : ACTION.has(event.type) ? "act" : "run";
  }
}

function isError(event: RunEvent): boolean {
  return (event.type === "tool_result" && event.is_error) || event.type === "retry" || event.type === "telemetry_error" ||
    (event.type === "native_action" && event.kind === "harness_bug") ||
    (event.type === "operator_control" && (event.emulator_frozen === false || event.status === "failed"));
}

function base(entry: Entry): Pick<TraceStep, "key" | "seqs" | "kind"> {
  const first = entry.events[0] as RunEvent;
  return { key: first.seq, seqs: entry.events.map((e) => e.seq), kind: first.type };
}

function describe(entry: Entry): TraceStep {
  const first = entry.events[0] as RunEvent;
  switch (first.type) {
    case "assistant": return thought(entry, first);
    case "tool_call": return tool(entry, first);
    case "loop_guard": return guard(entry, first);
    case "milestone": return {
      ...base(entry), category: "ms", iconHtml: STAR_SVG, tone: "gold", titleHtml: esc(`Milestone ${first.name.replace(/_/g, " ")}`),
      summaryHtml: esc([first.kind, first.origin === "present_at_start" ? "already present when run started" : null, first.evidence === undefined ? null : `evidence ${first.evidence.map((s) => `#${String(s)}`).join(", ")}`].filter((x) => x !== null && x !== undefined).join(" · ")),
      desc: `#${String(first.seq)}`, status: null, body: null,
    };
    case "native_action": {
      const [icon, tone] = NATIVE_ICON[first.kind] ?? ["ENG", "engine"];
      return { ...base(entry), category: entry.category, iconHtml: icon, tone, titleHtml: esc(first.kind.replace(/_/g, " ")), summaryHtml: esc(JSON.stringify(first.details)), desc: `#${String(first.seq)} · frame ${String(first.frame)} (first observed)`, status: isError(first) ? "error" : null, body: null };
    }
    default: {
      const [icon, title] = RUN_LABEL[first.type] ?? ["EV", first.type];
      const category = entry.category;
      const text = "text" in first && typeof first.text === "string" ? first.text : null;
      return {
        ...base(entry), category, iconHtml: esc(icon), tone: category === "err" ? "error" : category === "mem" ? "teal" : "ok", titleHtml: esc(title),
        summaryHtml: eventText(first) ?? "", desc: `#${String(first.seq)}${text === null ? "" : ` · ${num(text.length)} chars`}`, status: isError(first) ? "error" : null,
        body: text === null ? null : `<pre class="res">${esc(text)}</pre>`,
      };
    }
  }
}

function thought(entry: Entry, event: Of<"assistant">): TraceStep {
  const reply = event.text.trim() !== "" && event.text.trim() !== event.thinking.trim() ? `<div class="args">reply: ${esc(event.text)}</div>` : "";
  const error = event.error === undefined ? "" : `<div class="args">model error: ${esc(event.error)}</div>`;
  return {
    ...base(entry), category: "think", iconHtml: "THK", tone: "think",
    titleHtml: event.thinking !== "" ? `Thought for ${secs(event.latency_ms)}` : event.text.trim() === "" && event.error !== undefined ? "Model error" : "Replied",
    summaryHtml: esc(firstLine(event.thinking || event.text || (event.error ?? ""))),
    desc: `#${String(event.seq)} · ${num(event.usage.output)} out${event.ttft_ms === null ? "" : ` · ttft ${secs(event.ttft_ms)}`}`,
    status: event.error === undefined ? null : "error",
    body: `${event.thinking === "" ? "" : `<div class="thought">${esc(event.thinking.trim())}</div>`}${reply}${error}` || null,
  };
}

function resultSummary(result: Of<"tool_result">): string {
  const lines = result.text.split("\n");
  const press = lines.find((line) => line.startsWith("Press result:"));
  return press === undefined ? firstLine(result.text).replace(/^Navigation: /, "") : firstLine(press.replace("Press result: ", ""));
}

function tool(entry: Entry, call: Of<"tool_call">): TraceStep {
  // navigate_to records one press per step, all under one call.
  const presses = entry.events.filter((e): e is Of<"button_press"> => e.type === "button_press");
  const press = call.name === "press" ? presses[0] : undefined;
  const wait = entry.events.find((e): e is Of<"wait_input"> => e.type === "wait_input");
  const result = entry.events.find((e): e is Of<"tool_result"> => e.type === "tool_result");
  const args = JSON.stringify(call.args ?? null);
  const icon = call.name === "press" ? "BTN" : call.name === "navigate_to" ? "NAV" : call.name === "observe" ? "EYE" : esc(call.name.slice(0, 3).toUpperCase());
  const title = press !== undefined ? `Pressed ${press.buttons.map(chip).join("")}` : `<code>${esc(call.name)}</code> <span class="dim">${esc(args.length > 80 ? `${args.slice(0, 80)}…` : args)}</span>`;
  const status = result === undefined ? null : result.is_error ? "error" : /^Navigation: no supported path|unchanged world position/m.test(result.text) ? "warn" : null;
  const details = [`${esc(call.name)}(${esc(args)})`, ...presses.map((p) => eventText(p)), wait === undefined ? null : eventText(wait)].filter((x) => x !== null).join(" · ");
  const frames = result === undefined || result.frames.length === 0 ? "" : `<div class="args">${result.frames.map((f) => esc(f.path)).join(" · ")}</div>`;
  const body = `<div class="args">${details}</div>${result === undefined ? '<p class="nodata">waiting for result</p>' : `<details class="res-d" open><summary class="res-head"><span class="tog">tool_result · ${esc(result.name)} · ${num(result.text.length)} chars · ${String(result.duration_ms)} ms</span><span>#${String(result.seq)}</span></summary><pre class="res">${esc(result.text)}</pre>${frames}</details>`}`;
  return {
    ...base(entry), category: "act", iconHtml: icon, tone: status === "error" ? "error" : status === "warn" ? "warn" : "ok", titleHtml: title,
    summaryHtml: result === undefined ? "waiting for result" : `→ ${esc(resultSummary(result))}`,
    desc: `#${String(call.seq)}${presses.length > 1 ? ` · ${String(presses.length)} presses` : ""}${result === undefined ? "" : ` · ${String(result.duration_ms)} ms`}`, status, body,
  };
}

function guard(entry: Entry, event: Of<"loop_guard">): TraceStep {
  const diagnostic = "mode" in event && event.mode === "diagnostic";
  const supervisor = event.phase === "supervisor";
  const body = `<div class="thought">${esc(event.message)}</div><div class="args">${entry.label === null ? `evidence ${event.evidence.map((s) => `#${String(s)}`).join(", ")}${"mode" in event ? ` · ${event.mode}` : ""}` : esc(entry.label)}</div>`;
  return {
    ...base(entry), category: supervisor ? "sup" : "guard",
    iconHtml: supervisor ? "SUP" : "LG", tone: supervisor ? "red" : diagnostic ? "engine" : event.phase === "recovered" ? "ok" : "orange",
    titleHtml: supervisor ? "Supervisor note" : esc(`Loop guard · ${LOOP_KIND[event.kind]} ${diagnostic ? `diagnostic: ${event.phase.replace("_", " ")}` : event.phase}`),
    // Activity history flagged unrecovered enforced guards as errors; the supervisor row stays plain by operator request.
    summaryHtml: esc(firstLine(event.message.replace(/^SUPERVISOR: /, ""))), desc: `#${String(event.seq)} · call ${String(event.calls)}`,
    status: !supervisor && !diagnostic && event.phase !== "recovered" ? "error" : null, body,
  };
}

// Every row has the same anatomy: icon · title · one-line summary · desc · status.
export function traceRow(step: TraceStep, gutter?: string): string {
  const status = step.status === "error" ? '<span class="st error">error</span>' : step.status === "warn" ? '<span class="st warn">no effect</span>' : "";
  const head = `${gutter === undefined ? "" : `<span class="tg">${esc(gutter)}</span>`}<span class="tl-icon ic-${step.tone}">${step.iconHtml}</span><span class="tl-title">${step.titleHtml}</span><span class="tl-res">${step.summaryHtml}</span>${step.desc === "" ? "" : `<span class="tl-desc">${esc(step.desc)}</span>`}${status}`;
  const attrs = `class="tl" data-key="${String(step.key)}" data-seqs="${step.seqs.join(" ")}" data-c="${step.category}"`;
  if (step.body === null) return `<div ${attrs}><div class="tl-row">${head}<span class="chev blank"></span></div></div>`;
  return `<details ${attrs}><summary class="tl-row">${head}<span class="chev">›</span></summary><div class="tl-body">${step.body}</div></details>`;
}

export interface TraceOptions {
  // Run time at an event (operator pauses excluded); null before the run starts.
  readonly elapsed: ((ms: number) => number) | null;
  readonly live: { readonly turn: number } | null;
  // Turns on screen, and how many more each SHOW OLDER click adds.
  readonly limit: number;
  readonly page: number;
}

// One turn's rows. The stamp changes exactly when its HTML would, so the viewer
// redraws only the turns that changed and builds HTML only for those.
export interface TraceGroup {
  readonly key: string;
  readonly stamp: string;
  html(): string;
}

const LIVE_ROW = '<div class="tl tl-think live-row" data-c="think"><div class="tl-row"><span class="tl-icon ic-think pulse">THK</span><span class="tl-title shimmer">Thinking</span><span class="tl-res">current turn · always open</span><span class="tl-desc" data-live-secs></span><span class="st running">running</span><span class="chev blank"></span></div><div class="tl-body always"><div class="thought" data-live-text></div></div></div>';

function turnHead(turn: number, ms: number | null, elapsed: ((ms: number) => number) | null, tokens: number | null): string {
  const meta = [elapsed === null || ms === null ? null : hms(elapsed(ms)), tokens === null ? null : `${num(tokens)} tok in`].filter((x) => x !== null).join(" · ");
  return `<div class="turn-h">${turn === 0 ? "RUN START" : `TURN ${String(turn)}`} <span class="meta">${meta}</span></div>`;
}

// Newest turn first; inside a turn, rows keep seq order.
export function traceGroups(turns: readonly TraceTurn[], on: ReadonlySet<TraceCategory>, options: TraceOptions): { groups: TraceGroup[]; more: number } {
  const groups: TraceGroup[] = [];
  let more = 0;
  const live = options.live;
  const filter = [...on].sort().join(",");
  if (live !== null && !turns.some((t) => t.turn === live.turn)) groups.push({ key: `t${String(live.turn)}`, stamp: "live", html: () => turnHead(live.turn, null, null, null) + LIVE_ROW });
  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i] as TraceTurn;
    const isLive = live?.turn === turn.turn;
    // Only the turns on screen become HTML; the rest are counted.
    if (groups.length >= options.limit) {
      if (isLive || turn.entries.some((entry) => on.has(entry.category))) more += 1;
      continue;
    }
    const shown = turn.entries.filter((entry) => on.has(entry.category));
    if (shown.length === 0 && !isLive) continue;
    // Rows hidden by a chip never change the stamp, so they never redraw the turn.
    groups.push({
      key: `t${String(turn.turn)}`,
      stamp: `${shown.map((entry) => entry.stamp).join(",")}|${String(turn.inputTokens)}|${filter}|${String(isLive)}|${String(options.elapsed !== null)}`,
      html: () => turnHead(turn.turn, turn.ms, options.elapsed, turn.inputTokens) + shown.map((entry) => entry.html()).join("") + (isLive ? LIVE_ROW : ""),
    });
  }
  return { groups, more };
}

export function moreButton(more: number, page: number): string {
  return more > 0 ? `<button type="button" class="pbtn trace-more" data-trace-more>SHOW ${String(Math.min(more, page))} OLDER TURNS</button>` : "";
}

export const groupHtml = (group: TraceGroup): string => `<div class="tgroup" data-group="${group.key}">${group.html()}</div>`;

export function traceHtml(turns: readonly TraceTurn[], on: ReadonlySet<TraceCategory>, options: TraceOptions): string {
  const { groups, more } = traceGroups(turns, on, options);
  return groups.length === 0 ? '<p class="nodata">no recorded events</p>' : groups.map(groupHtml).join("") + moreButton(more, options.page);
}

// The side panel's earlier steps: agent and harness only, newest turn first.
// `boxTurn` is the turn whose thought the Emerald box shows; it is not repeated here.
export function sideGroups(turns: readonly TraceTurn[], limit: number, boxTurn: number | null = null): TraceGroup[] {
  const groups: TraceGroup[] = [];
  for (let i = turns.length - 1; i >= 0 && groups.length < limit; i -= 1) {
    const turn = turns[i] as TraceTurn;
    const shown = turn.entries.filter((entry) => SIDE.has(entry.category) && !(entry.category === "think" && turn.turn === boxTurn));
    if (shown.length > 0) groups.push({ key: `t${String(turn.turn)}`, stamp: shown.map((entry) => entry.stamp).join(","), html: () => shown.map((entry, j) => entry.sideHtml(j === 0 ? `T${String(turn.turn)}` : "")).join("") });
  }
  return groups;
}

export function sideTraceHtml(turns: readonly TraceTurn[], limit: number, boxTurn: number | null = null): string {
  const groups = sideGroups(turns, limit, boxTurn);
  return groups.length === 0 ? '<p class="nodata">no steps yet</p>' : groups.map(groupHtml).join("");
}
