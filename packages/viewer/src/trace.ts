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
  readonly icon: string;
  readonly tone: string;
  readonly title: string;
  readonly summary: string;
  readonly desc: string;
  readonly status: "error" | "warn" | null;
  readonly body: string | null;
}

class Entry {
  readonly events: RunEvent[];
  constructor(first: RunEvent) {
    this.events = [first];
  }
}

export class TraceTurn {
  readonly entries: Entry[] = [];
  constructor(readonly turn: number, readonly ms: number) {}
  inputTokens: number | null = null;

  steps(): TraceStep[] {
    return this.entries.map(describe);
  }
}

export class TraceBuilder {
  readonly turns: TraceTurn[] = [];
  version = 0;
  private readonly tools = new Map<string, Entry>();

  add(event: RunEvent): void {
    if (eventText(event) === null) return;
    this.version += 1;
    const owner = this.ownerOf(event);
    if (owner !== undefined) {
      owner.events.push(event);
      return;
    }
    const entry = new Entry(event);
    if (event.type === "tool_call") this.tools.set(event.id, entry);
    let turn = this.turns.at(-1);
    if (turn?.turn !== event.turn) {
      turn = this.turns.find((t) => t.turn === event.turn) ?? this.insert(new TraceTurn(event.turn, eventMs(event)));
    }
    if (event.type === "assistant") turn.inputTokens = event.usage.input;
    turn.entries.push(entry);
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
const firstLine = (text: string): string => text.trim().split("\n")[0] ?? "";
const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;
const LOOP_KIND = { planning: "planning", observation: "observation", ineffective: "ineffective", cycle: "cycle", rejection: "rejection" } as const;
const NATIVE_ICON: Readonly<Record<string, readonly [string, string]>> = {
  native_input: ["IN", "engine"], menu_changed: ["MNU", "engine"], harness_bug: ["BUG", "error"],
  battle_signal: ["VS", "battle"], battle_started: ["VS", "battle"], battle_ended: ["VS", "battle"], battle_outcome: ["VS", "battle"],
  pokemon_acquired: ["NEW", "gold"], pokemon_captured: ["NEW", "gold"],
};
const RUN_LABEL: Readonly<Partial<Record<RunEvent["type"], readonly [string, string]>>> = {
  operator_control: ["CTL", "Operator control"], objective_update: ["OBJ", "Objective updated"], objective_attempt: ["OBJ", "Objective attempt"],
  disk_usage: ["HDD", "Disk usage"], frames_evicted: ["HDD", "Frames evicted"], run_end: ["END", "Run ended"],
  compaction: ["CMP", "Context compacted"], navigation_context: ["MEM", "Navigation memory delivered"], ledger_context: ["MEM", "Instruction ledger delivered"],
  milestone_hint: ["MEM", "Milestone hint sent"], decision_input: ["SNP", "Decision snapshot"], battle_choice: ["VS", "Battle choice"],
  activity: ["ACT", "Activity"], retry: ["↻", "Retry"], telemetry_error: ["!", "Telemetry error"],
  button_press: ["BTN", "Press"], tool_result: ["RES", "Tool result"], wait_input: ["WAIT", "Wait"],
};
const MEMORY = new Set<RunEvent["type"]>(["navigation_context", "ledger_context", "milestone_hint", "decision_input", "compaction"]);
const ACTION = new Set<RunEvent["type"]>(["battle_choice", "objective_attempt", "button_press", "tool_result", "wait_input"]);

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
      ...base(entry), category: "ms", icon: STAR_SVG, tone: "gold", title: esc(`Milestone ${first.name.replace(/_/g, " ")}`),
      summary: esc([first.kind, first.origin === "present_at_start" ? "already present when run started" : null, first.evidence === undefined ? null : `evidence ${first.evidence.map((s) => `#${String(s)}`).join(", ")}`].filter((x) => x !== null && x !== undefined).join(" · ")),
      desc: "", status: null, body: null,
    };
    case "native_action": {
      const [icon, tone] = NATIVE_ICON[first.kind] ?? ["ENG", "engine"];
      return { ...base(entry), category: "eng", icon, tone, title: esc(first.kind.replace(/_/g, " ")), summary: esc(JSON.stringify(first.details)), desc: `frame ${String(first.frame)}`, status: isError(first) ? "error" : null, body: null };
    }
    default: {
      const [icon, title] = RUN_LABEL[first.type] ?? ["EV", first.type];
      const category: TraceCategory = MEMORY.has(first.type) ? "mem" : ACTION.has(first.type) ? "act" : first.type === "activity" ? "eng" : first.type === "retry" || first.type === "telemetry_error" ? "err" : "run";
      const text = "text" in first && typeof first.text === "string" && first.type !== "tool_result" ? first.text : null;
      return {
        ...base(entry), category, icon, tone: category === "err" ? "error" : category === "mem" ? "teal" : category === "eng" ? "engine" : "ok", title: esc(title),
        summary: eventText(first) ?? "", desc: text === null ? "" : `${num(text.length)} chars`, status: isError(first) ? "error" : null,
        body: text === null ? null : `<pre class="res">${esc(text)}</pre>`,
      };
    }
  }
}

function thought(entry: Entry, event: Of<"assistant">): TraceStep {
  const reply = event.text.trim() !== "" && event.text.trim() !== event.thinking.trim() ? `<div class="args">reply: ${esc(event.text)}</div>` : "";
  const error = event.error === undefined ? "" : `<div class="args">model error: ${esc(event.error)}</div>`;
  return {
    ...base(entry), category: "think", icon: "THK", tone: "think",
    title: event.thinking === "" ? "Replied" : `Thought for ${secs(event.latency_ms)}`,
    summary: esc(firstLine(event.thinking || event.text)),
    desc: `${num(event.usage.output)} out${event.ttft_ms === null ? "" : ` · ttft ${secs(event.ttft_ms)}`}`,
    status: event.error === undefined ? null : "error",
    body: `${event.thinking === "" ? "" : `<div class="thought">${esc(event.thinking.trim())}</div>`}${reply}${error}`,
  };
}

function resultSummary(result: Of<"tool_result">): string {
  const lines = result.text.split("\n");
  const press = lines.find((line) => line.startsWith("Press result:"));
  return press === undefined ? firstLine(result.text).replace(/^Navigation: /, "") : press.replace("Press result: ", "");
}

function tool(entry: Entry, call: Of<"tool_call">): TraceStep {
  const press = entry.events.find((e): e is Of<"button_press"> => e.type === "button_press");
  const wait = entry.events.find((e): e is Of<"wait_input"> => e.type === "wait_input");
  const result = entry.events.find((e): e is Of<"tool_result"> => e.type === "tool_result");
  const args = JSON.stringify(call.args ?? null);
  const icon = call.name === "press" ? "BTN" : call.name === "navigate_to" ? "NAV" : call.name === "observe" ? "EYE" : call.name.slice(0, 3).toUpperCase();
  const title = press !== undefined ? `Pressed ${press.buttons.map(chip).join("")}` : `<code>${esc(call.name)}</code> <span class="dim">${esc(args.length > 80 ? `${args.slice(0, 80)}…` : args)}</span>`;
  const status = result === undefined ? null : result.is_error ? "error" : /^Navigation: no supported path|unchanged world position/m.test(result.text) ? "warn" : null;
  const details = [`${esc(call.name)}(${esc(args)})`, press === undefined ? null : eventText(press), wait === undefined ? null : eventText(wait)].filter((x) => x !== null).join(" · ");
  const frames = result === undefined || result.frames.length === 0 ? "" : `<div class="args">${result.frames.map((f) => esc(f.path)).join(" · ")}</div>`;
  const body = `<div class="args">${details}</div>${result === undefined ? '<p class="nodata">waiting for result</p>' : `<details class="res-d" open><summary class="res-head"><span class="tog">tool_result · ${esc(result.name)} · ${num(result.text.length)} chars · ${String(result.duration_ms)} ms</span><span>#${String(result.seq)}</span></summary><pre class="res">${esc(result.text)}</pre>${frames}</details>`}`;
  return {
    ...base(entry), category: "act", icon, tone: status === "error" ? "error" : status === "warn" ? "warn" : "ok", title,
    summary: result === undefined ? "waiting for result" : `→ ${esc(resultSummary(result))}`,
    desc: result === undefined ? "" : `${String(result.duration_ms)} ms`, status, body,
  };
}

function guard(entry: Entry, event: Of<"loop_guard">): TraceStep {
  const diagnostic = "mode" in event && event.mode === "diagnostic";
  const supervisor = event.phase === "supervisor";
  const body = `<div class="thought">${esc(event.message)}</div><div class="args">evidence ${event.evidence.map((s) => `#${String(s)}`).join(", ")}${"mode" in event ? ` · ${event.mode}` : ""}</div>`;
  return {
    ...base(entry), category: supervisor ? "sup" : "guard",
    icon: supervisor ? "SUP" : "LG", tone: supervisor ? "red" : diagnostic ? "engine" : event.phase === "recovered" ? "ok" : "orange",
    title: supervisor ? "Supervisor note" : esc(`Loop guard · ${LOOP_KIND[event.kind]} ${diagnostic ? `diagnostic: ${event.phase.replace("_", " ")}` : event.phase}`),
    summary: esc(firstLine(event.message.replace(/^SUPERVISOR: /, ""))), desc: `call ${String(event.calls)}`, status: null, body,
  };
}

// Every row has the same anatomy: icon · title · one-line summary · desc · status.
export function traceRow(step: TraceStep, gutter?: string): string {
  const status = step.status === "error" ? '<span class="st error">error</span>' : step.status === "warn" ? '<span class="st warn">no effect</span>' : "";
  const head = `${gutter === undefined ? "" : `<span class="tg">${esc(gutter)}</span>`}<span class="tl-icon ic-${step.tone}">${step.icon}</span><span class="tl-title">${step.title}</span><span class="tl-res">${step.summary}</span>${step.desc === "" ? "" : `<span class="tl-desc">${esc(step.desc)}</span>`}${status}`;
  const attrs = `class="tl" data-key="${String(step.key)}" data-seqs="${step.seqs.join(" ")}" data-c="${step.category}"`;
  if (step.body === null) return `<div ${attrs}><div class="tl-row">${head}<span class="chev blank"></span></div></div>`;
  return `<details ${attrs}><summary class="tl-row">${head}<span class="chev">›</span></summary><div class="tl-body">${step.body}</div></details>`;
}

export function chipCounts(turns: readonly TraceTurn[]): Record<TraceCategory, number> {
  const counts = Object.fromEntries(TRACE_CHIPS.map((chip) => [chip.id, 0])) as Record<TraceCategory, number>;
  for (const turn of turns) for (const step of turn.steps()) counts[step.category] += 1;
  return counts;
}

export interface TraceOptions {
  readonly startMs: number | null;
  readonly live: { readonly turn: number } | null;
  readonly limit: number;
}

const LIVE_ROW = '<div class="tl tl-think live-row" data-c="think"><div class="tl-row"><span class="tl-icon ic-think pulse">THK</span><span class="tl-title shimmer">Thinking</span><span class="tl-res">current turn · always open</span><span class="tl-desc" data-live-secs></span><span class="st running">running</span><span class="chev blank"></span></div><div class="tl-body always"><div class="thought" data-live-text></div></div></div>';

function turnHead(turn: number, ms: number | null, startMs: number | null, tokens: number | null): string {
  const meta = [startMs === null || ms === null ? null : hms((ms - startMs) / 1000), tokens === null ? null : `${num(tokens)} tok in`].filter((x) => x !== null).join(" · ");
  return `<div class="turn-h">${turn === 0 ? "RUN START" : `TURN ${String(turn)}`} <span class="meta">${meta}</span></div>`;
}

// Newest turn first; inside a turn, rows keep seq order.
export function traceHtml(turns: readonly TraceTurn[], on: ReadonlySet<TraceCategory>, options: TraceOptions): string {
  const groups: string[] = [];
  const live = options.live;
  if (live !== null && !turns.some((t) => t.turn === live.turn)) groups.push(turnHead(live.turn, null, null, null) + LIVE_ROW);
  for (const turn of [...turns].reverse()) {
    const rows = turn.steps().filter((step) => on.has(step.category)).map((step) => traceRow(step));
    if (live?.turn === turn.turn) rows.push(LIVE_ROW);
    if (rows.length > 0) groups.push(turnHead(turn.turn, turn.ms, options.startMs, turn.inputTokens) + rows.join(""));
  }
  if (groups.length === 0) return '<p class="nodata">no recorded events</p>';
  const more = groups.length - options.limit;
  return groups.slice(0, options.limit).join("") + (more > 0 ? `<button type="button" class="pbtn trace-more" data-trace-more>SHOW ${String(Math.min(more, options.limit))} OLDER TURNS</button>` : "");
}

// The side panel's earlier steps: agent and harness only, newest turn first.
export function sideTraceHtml(turns: readonly TraceTurn[], limit: number): string {
  const groups: string[] = [];
  for (const turn of [...turns].reverse()) {
    if (groups.length >= limit) break;
    const steps = turn.steps().filter((step) => SIDE.has(step.category));
    if (steps.length > 0) groups.push(steps.map((step, i) => traceRow(step, i === 0 ? `T${String(turn.turn)}` : "")).join(""));
  }
  return groups.length === 0 ? '<p class="nodata">no steps yet</p>' : groups.join("");
}
