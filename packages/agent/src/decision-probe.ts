// Decision-point probes (M6 of the harness-fixes worklog): rebuild the exact context a recorded turn
// was decided from, re-derive it under a different switch set, and sample the next tool call.
// Everything model-facing is rebuilt by the harness's own code fed with the recorded event stream:
// the loop guard, supervisor, stall briefing, navigation memory, ledger and hint through the play
// wiring; press results through pressResult; readouts through the server's renderer (env rerender.py).
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, Message, TextContent, ThinkingContent, Tool, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import { checkEvent, type Button, type EventBody, type RunEvent } from "./events.js";
import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featuresOf, type FeatureSet, type SwitchableFeature } from "./features.js";
import type { GameStateSnapshot } from "./game-state.js";
import { GATEWAY_PROVIDER } from "./gateway.js";
import { gameTools } from "./game-tools.js";
import { Governor, NUDGE, attachLoopGuard, slideWindow, withoutTextOnlyReplies } from "./harness.js";
import type { LoopNotice } from "./loop-detection.js";
import { PLAY_LIMITS, PLAY_TASK, playSystemPrompt, targetGoal, toolSwitches } from "./play-config.js";
import { contextTools, loopSupervisor, playGameTools, stallBriefing } from "./play-wiring.js";
import { ShownStates, pressResult } from "./press-result.js";

type StateEvent = Extract<RunEvent, { type: "state"; started: boolean }>;
type RunStartEvent = Extract<RunEvent, { type: "run_start" }>;
type TurnStartEvent = Extract<RunEvent, { type: "turn_start" }>;
type ToolResultEvent = Extract<RunEvent, { type: "tool_result" }>;
export interface RawRef { readonly path: string; readonly sha256: string }
export interface ContextSize { readonly messages: number; readonly images: number; readonly est_tokens: number }

export interface ProbeSwitch { readonly id: SwitchableFeature; readonly on: boolean }
export function parseSwitch(arg: string): ProbeSwitch {
  const match = /^([a-z0-9-]+)=(on|off)$/.exec(arg);
  const id = SWITCHABLE_FEATURES.find((f) => f === match?.[1]);
  if (match === null || id === undefined) throw new Error(`--switch wants <feature-id>=on|off with a known switch id, got ${JSON.stringify(arg)}`);
  return { id, on: match[2] === "on" };
}

export interface RecordedRun { readonly events: readonly RunEvent[]; readonly start: RunStartEvent }
export function parseRun(text: string): RecordedRun {
  const events = text.split("\n").filter((line) => line.trim() !== "").map((line) => checkEvent(JSON.parse(line)));
  const start = events.find((e): e is RunStartEvent => e.type === "run_start");
  if (start === undefined) throw new Error("event log has no run_start");
  return { events, start };
}
export const recordedFeatures = (run: RecordedRun): FeatureSet => featuresOf(run.start.harness_features);
export function withSwitches(features: FeatureSet, flips: readonly ProbeSwitch[]): FeatureSet {
  const next = { ...features };
  for (const flip of flips) next[flip.id] = flip.on;
  const problems = dependencyProblems(next);
  if (problems.length > 0) throw new Error(`switch set is inconsistent: ${problems.join("; ")}`);
  return next;
}

export interface ProbePorts {
  /** Base64 PNG of a recorded frame (path relative to the run directory). */
  readonly frame: (path: string) => string;
  /** Readouts re-rendered from raw RAM under a feature set, in order. */
  readonly rerender: (refs: readonly RawRef[], features: FeatureSet) => Promise<readonly string[]>;
  /** The field the gateway streamed reasoning in (pi's thinkingSignature); prior reasoning is sent back under it. Events do not record it. */
  readonly thinkingSignature: string;
}

export interface DecisionContext {
  readonly turn: number;
  readonly systemPrompt: string;
  readonly messages: readonly Message[];
  readonly tools: readonly Tool[];
  readonly size: ContextSize;
}

// The model-facing text of every recorded tool result, re-derived under `features`.
interface ResultParts { readonly event: ToolResultEvent; readonly before: StateEvent | undefined; readonly after: StateEvent | undefined; readonly buttons: readonly Button[] | null; readonly auto: boolean }
// Switches that shape an auto-advanced result's text; such a result is composed from many inner presses and is kept as recorded.
const AUTO_TEXT: readonly SwitchableFeature[] = ["dialogue-auto-advance-v1", "press-result-v1", "transition-press-result-v1", "live-player-position-v1", "field-control-lock", "dialogue-safe-batches-v1", "pushback-press-result-v1"];

const PRESS_LINE = /^Press result: .*\n/m;
function pressLine(text: string, line: string | null): string {
  if (!PRESS_LINE.test(text)) return line === null ? text : text.replace(/\n\n/, `\n${line}\n\n`);
  return text.replace(PRESS_LINE, line === null ? "" : `${line}\n`);
}


// A readout starts at its Screen line; tool prefixes (press echo, press result, navigation status) never do.
const READOUT = /^Screen: /m;
export const serverSwitch = (id: SwitchableFeature): boolean => id === "active-ui-ownership-v1" || SERVER_FEATURES.includes(id);

async function resultTexts(parts: readonly ResultParts[], recorded: FeatureSet, features: FeatureSet, ports: ProbePorts, visible: ReadonlySet<number>, rerender: boolean): Promise<Map<number, string>> {
  const texts = new Map<number, string>();
  const auto = parts.find((p) => p.auto && (AUTO_TEXT.some((id) => recorded[id] !== features[id]) || (rerender && visible.has(p.event.seq))));
  if (auto !== undefined) throw new Error(`tool_result seq ${String(auto.event.seq)} was auto-advanced through dialogue; its text cannot be re-derived under these switches yet`);
  const shown = new ShownStates();
  const switches = toolSwitches(features);
  const rendered = parts.filter((p) => rerender && visible.has(p.event.seq) && p.after?.raw_ram !== undefined && READOUT.test(p.event.text));
  const readouts = rendered.length === 0 ? [] : await ports.rerender(rendered.map((p) => ({ path: p.after?.raw_ram?.path ?? "", sha256: p.after?.raw_ram?.sha256 ?? "" })), features);
  const fresh = new Map(rendered.map((p, i) => [p.event.seq, readouts[i] ?? ""]));
  for (const part of parts) {
    let text = part.event.text;
    if (part.auto) {
      if (part.after !== undefined) shown.record(part.after);
      texts.set(part.event.seq, text);
      continue;
    }
    const readout = fresh.get(part.event.seq);
    if (readout !== undefined) text = text.slice(0, text.search(READOUT)) + readout;
    if (part.buttons !== null && part.after !== undefined && part.event.name === "press" && !part.event.is_error) {
      const before: GameStateSnapshot | undefined = part.before;
      text = pressLine(text, switches.pressResult ? `Press result: ${pressResult(before, part.after, part.buttons, switches, shown)}` : null);
    }
    if (part.after !== undefined && !part.event.is_error) shown.record(part.after, part.event.name === "press" ? part.before : undefined);
    texts.set(part.event.seq, text);
  }
  return texts;
}

// The replay recorder: the recorded events in order, plus what the replayed wiring itself records.
export class Replay {
  private readonly observers: ((event: RunEvent) => void)[] = [];
  private readonly milestones: RunEvent[] = [];
  current: RunEvent;
  constructor(first: RunEvent) { this.current = first; }
  subscribe(observer: (event: RunEvent) => void, replayMilestones = false): void {
    this.observers.push(observer);
    if (replayMilestones) for (const m of this.milestones) observer(m);
  }
  /** The turn the next model call belongs to; the wiring's context notes are recorded under it. */
  upcoming = 1;
  dispatch(event: RunEvent, own = false): void {
    if (!own) this.current = event;
    if (event.type === "milestone") this.milestones.push(event);
    for (const o of this.observers) o(event);
  }
  private own(body: Record<string, unknown>, turn: number): void {
    this.dispatch(checkEvent({ ...body, v: 1, run: this.current.run, seq: this.current.seq, t: this.current.t, turn }), true);
  }
  readonly recordLoopGuard = (body: LoopNotice): void => { this.own({ type: "loop_guard", ...body, evidence: [...body.evidence] }, this.current.turn); };
  readonly recordNavigationContext = (body: Omit<Extract<EventBody, { type: "navigation_context" }>, "type">): void => { this.own({ type: "navigation_context", ...body }, this.upcoming); };
  readonly recordLedgerContext = (body: Omit<Extract<EventBody, { type: "ledger_context" }>, "type">): void => { this.own({ type: "ledger_context", ...body }, this.upcoming); };
  readonly recordMilestoneHint = (body: Omit<Extract<EventBody, { type: "milestone_hint" }>, "type">): void => { this.own({ type: "milestone_hint", ...body }, this.upcoming); };
  readonly recordBeliefLedger = (body: Omit<Extract<EventBody, { type: "belief_ledger" }>, "type">): void => { this.own({ type: "belief_ledger", ...body }, this.upcoming); };
  // Tool construction ports; a probe never executes a tool.
  readonly recordState = (): never => { throw new Error("probe tools never execute"); };
  readonly recordDialogueAutoAdvance = (): never => { throw new Error("probe tools never execute"); };
  readonly lowHpTrainerWarning = (): never => { throw new Error("probe tools never execute"); };
  readonly peopleIdCard = (): never => { throw new Error("probe tools never execute"); };
  readonly storyBattleWarning = (): never => { throw new Error("probe tools never execute"); };
}
// What the wiring itself records; the replay regenerates these instead of reading them.
const DERIVED: readonly RunEvent["type"][] = ["loop_guard", "navigation_context", "ledger_context", "milestone_hint", "text_only_supervisor", "belief_ledger"];

const inert = (): Promise<never> => Promise.reject(new Error("probe tools never execute"));

export function probeTools(features: FeatureSet, recorder: Replay): { tools: AgentTool[]; transform: (m: AgentMessage[]) => Promise<AgentMessage[]>; window: ReturnType<typeof contextTools>["window"] } {
  const base = gameTools("http://probe.invalid", { beforePress: () => undefined, afterPress: inert }, inert, toolSwitches(features));
  const tools = playGameTools(base, features, { read: inert }, recorder);
  const context = contextTools(features, recorder, (m) => Promise.resolve(m));
  return { tools: [...tools, ...context.tools], transform: context.transformContext, window: context.window };
}
const asTool = (t: AgentTool): Tool => ({ name: t.name, description: t.description, parameters: t.parameters });

export function contextSize(messages: readonly Message[]): ContextSize {
  let chars = 0, images = 0;
  for (const m of messages) {
    const parts = typeof m.content === "string" ? [{ type: "text" as const, text: m.content }] : m.content;
    for (const p of parts) {
      if (p.type === "image") images += 1;
      else if (p.type === "text") chars += p.text.length;
      else if (p.type === "thinking") chars += p.thinking.length;
    }
  }
  return { messages: messages.length, images, est_tokens: Math.ceil(chars / 4) };
}

/** The context of `turn`'s model call, rebuilt under `features` (the run's own switches reproduce the recording). */
// The conversation as the agent loop accumulated it: task, then each kept reply with its nudge or tool results.
function conversation(prior: readonly RunEvent[], goal: string | null, byId: ReadonlyMap<string, ToolResultEvent>, notes: readonly Extract<RunEvent, { type: "text_only_supervisor" }>[], texts: ReadonlyMap<number, string>, ports: ProbePorts, model: string): Message[] {
  const history: Message[] = [{ role: "user", content: goal === null ? PLAY_TASK : `The game has just booted. ${targetGoal(goal)}`, timestamp: 0 }];
  let note = 0;
  for (const e of prior) {
    if (e.type !== "assistant" || e.stop_reason === "error" || e.stop_reason === "aborted") continue;
    const content: (TextContent | ThinkingContent | ToolCall)[] = [];
    if (e.thinking !== "") content.push({ type: "thinking", thinking: e.thinking, thinkingSignature: ports.thinkingSignature });
    if (e.text !== "") content.push({ type: "text", text: e.text });
    for (const c of e.tool_calls) content.push({ type: "toolCall", id: c.id, name: c.name, arguments: c.args as Record<string, unknown> });
    const assistant: AssistantMessage = { role: "assistant", content, api: "openai-completions", provider: GATEWAY_PROVIDER, model, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: e.stop_reason, timestamp: 0 };
    history.push(assistant);
    if (e.tool_calls.length === 0) {
      const supervised = notes[note];
      const text = supervised !== undefined && supervised.seq > e.seq ? supervised.text : NUDGE;
      if (text !== NUDGE) note += 1;
      history.push({ role: "user", content: text, timestamp: 0 });
    }
    for (const c of e.tool_calls) {
      const r = byId.get(c.id);
      if (r === undefined) continue;
      const images: ImageContent[] = r.frames.map((f) => ({ type: "image", data: ports.frame(f.path), mimeType: "image/png" }));
      const result: ToolResultMessage = { role: "toolResult", toolCallId: c.id, toolName: r.name, content: [...images, { type: "text", text: texts.get(r.seq) ?? r.text }], isError: r.is_error, timestamp: 0 };
      history.push(result);
    }
  }
  return history;
}

/** `recorded` rebuilds what the model saw then (recorded notes, guard text and tool results); `replayed` re-derives all of it with today's code under `features`. */
export type Derivation = "recorded" | "replayed";
/** `rerender` re-renders every readout still in the window from raw RAM with today's renderer; the probe sets it in both arms whenever a server switch flips, so the arms differ only by the switch. */
export async function decisionContext(run: RecordedRun, turn: number, features: FeatureSet, ports: ProbePorts, derivation: Derivation = "replayed", rerender = false): Promise<DecisionContext> {
  const { events, start } = run;
  const target = events.find((e): e is TurnStartEvent => e.type === "turn_start" && e.turn === turn);
  if (target === undefined) throw new Error(`turn ${String(turn)} has no turn_start in this run`);
  if (features["objective-tracking-v1"] || features["state-only-decisions-v1"]) throw new Error("probes do not rebuild objective-tracking or state-only runs yet");
  const recorded = recordedFeatures(run);
  if (derivation === "recorded" && !sameSwitches(recorded, features)) throw new Error("the recorded context exists only under the run's own switches");
  const prior = events.filter((e) => e.seq < target.seq);
  const states = new Map(prior.filter((e): e is StateEvent => e.type === "state" && "started" in e).map((e) => [e.seq, e]));
  const pressed = new Map(prior.flatMap((e) => (e.type === "button_press" ? [[e.tool_call_id, e] as const] : [])));
  const calls = new Map(prior.flatMap((e) => (e.type === "tool_call" ? [[e.id, e] as const] : [])));
  const results = prior.filter((e): e is ToolResultEvent => e.type === "tool_result");
  const advanced = new Set(prior.flatMap((e) => (e.type === "dialogue_auto_advance" ? [e.tool_call_id] : [])));
  const parts: ResultParts[] = results.map((event) => {
    const press = pressed.get(event.id), call = calls.get(event.id);
    const buttons = call?.name === "press" && press !== undefined ? press.buttons : null;
    return { event, before: press?.before_state_seq === undefined ? undefined : states.get(press.before_state_seq), after: event.state_seq === undefined ? undefined : states.get(event.state_seq), buttons, auto: advanced.has(event.id) };
  });
  const goal = start.evaluation?.target ?? null;
  const byId = new Map(results.map((r) => [r.id, r]));
  const notes = prior.filter((e): e is Extract<RunEvent, { type: "text_only_supervisor" }> => e.type === "text_only_supervisor");
  const window = contextTools(features, new Replay(start), (m) => Promise.resolve(m)).window;
  const recordedHistory = conversation(prior, goal, byId, notes, new Map(), ports, start.model.id);
  // Only results the window keeps whole are shown in full, so only those are re-derived.
  const kept = new Set(slideWindow(recordedHistory, window).flatMap((m) => (m.role === "toolResult" && m.content.some((p) => p.type === "text" && p.text === byId.get(m.toolCallId)?.text) ? [byId.get(m.toolCallId)?.seq ?? -1] : [])));
  const texts = derivation === "recorded" ? new Map<number, string>() : await resultTexts(parts, recorded, features, ports, kept, rerender);
  const history = derivation === "recorded" ? recordedHistory : conversation(prior, goal, byId, notes, texts, ports, start.model.id);
  if (derivation === "recorded") {
    const wiring = probeTools(features, new Replay(start));
    const tools = wiring.tools.map(asTool);
    const window = slideWindow(history, wiring.window);
    const messages = (features["fresh-retry-v1"] ? withoutTextOnlyReplies(window) : window).filter(isMessage);
    const notes = recordedNotes(prior, turn);
    for (const text of notes) messages.push({ role: "user", content: text, timestamp: 0 });
    return { turn, systemPrompt: start.system_prompt, messages, tools, size: contextSize(messages) };
  }
  // The wiring, replayed over the recorded stream under the probe's switches.
  const replay = new Replay(start);
  const governor = new Governor({ limits: PLAY_LIMITS, retry: () => undefined, abort: () => undefined, now: () => 0 });
  const detector = attachLoopGuard(replay, governor, undefined, features["deterministic-loop-guard-v1"] ? "enforced" : "diagnostic", features["interaction-loop-detection-v1"], loopSupervisor(features, replay), features["transition-loop-detection-v1"], features["pushback-loop-detection-v1"], features["battle-observation-loop-v1"], features["navigation-truth-v1"], features["ineffective-loops-v1"]);
  const t0 = Date.parse(start.t);
  stallBriefing(features, replay, detector, { pausedMs: () => 0 }, () => Date.parse(replay.current.t) - t0);
  const wiring = probeTools(features, replay);
  for (const e of prior) {
    if (DERIVED.includes(e.type)) continue;
    if (e.type === "turn_start") { replay.upcoming = e.turn; detector.context(); await wiring.transform([]); }
    replay.dispatch(e);
  }
  replay.upcoming = target.turn;
  const warning = detector.context();
  const windowed = slideWindow(history, wiring.window);
  if (warning !== null) windowed.push({ role: "user", content: warning, timestamp: 0 });
  const messages = (await wiring.transform(windowed)).filter(isMessage);
  return { turn, systemPrompt: playSystemPrompt(features, goal), messages, tools: wiring.tools.map(asTool), size: contextSize(messages) };
}
// The guard text in context at `turn` (LoopDetector.context over the recorded notices), then the
// pinned hint and this turn's ledger and navigation memory, in the order the wiring appended them.
export function recordedNotes(prior: readonly RunEvent[], turn: number): string[] {
  let guard: string | null = null, hint: string | null = null;
  for (const e of prior) {
    if (e.type === "milestone_hint") hint = e.text;
    if (e.type !== "loop_guard" || ("mode" in e && e.mode === "diagnostic")) continue;
    if (e.phase === "warning") guard = `LOOP GUARD (${e.kind}): ${e.message} Recovery is bounded; objective wording and new evidence IDs alone do not establish progress.`;
    else if (e.phase === "supervisor") guard = e.message;
    else guard = null;
  }
  const own = prior.filter((e) => e.turn === turn && (e.type === "ledger_context" || e.type === "navigation_context")).flatMap((e) => (e.type === "ledger_context" || e.type === "navigation_context" ? [e.text] : []));
  // disproved-beliefs-v1 wraps the hint in the context chain, so its message comes before the pinned hint.
  const beliefs = prior.filter((e) => e.turn === turn && e.type === "belief_ledger").flatMap((e) => (e.type === "belief_ledger" ? [e.text] : []));
  return [...(guard === null ? [] : [guard]), ...beliefs, ...(hint === null ? [] : [hint]), ...own];
}
const sameSwitches = (a: FeatureSet, b: FeatureSet): boolean => SWITCHABLE_FEATURES.every((id) => a[id] === b[id]);
const isMessage = (m: AgentMessage): m is Message => "role" in m;

// ---- sampling and report ----
export interface Decision { readonly key: string; readonly thinking: string }
export type Sampler = (context: DecisionContext) => Promise<AssistantMessage>;
export function decisionOf(message: AssistantMessage): Decision {
  const call = message.content.find((p): p is ToolCall => p.type === "toolCall");
  const thinking = message.content.flatMap((p) => (p.type === "thinking" ? [p.thinking] : [])).join("");
  if (message.stopReason === "error" || message.stopReason === "aborted") return { key: `(model error: ${message.errorMessage ?? message.stopReason})`, thinking };
  return { key: call === undefined ? "(text only)" : `${call.name} ${JSON.stringify(call.arguments)}`, thinking };
}
export async function sample(context: DecisionContext, k: number, sampler: Sampler): Promise<Decision[]> {
  const out: Decision[] = [];
  for (let i = 0; i < k; i++) out.push(decisionOf(await sampler(context)));
  return out;
}
export function distribution(decisions: readonly Decision[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const d of decisions) counts.set(d.key, (counts.get(d.key) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
export interface ContextDiff { readonly systemPrompt: boolean; readonly tools: boolean; readonly messages: number[] }
export function contextDiff(a: DecisionContext, b: DecisionContext): ContextDiff {
  const text = (m: Message | undefined): string => JSON.stringify(m?.content);
  const n = Math.max(a.messages.length, b.messages.length);
  const changed: number[] = [];
  for (let i = 0; i < n; i++) if (text(a.messages[i]) !== text(b.messages[i])) changed.push(i);
  return { systemPrompt: a.systemPrompt !== b.systemPrompt, tools: JSON.stringify(a.tools) !== JSON.stringify(b.tools), messages: changed };
}
export function recordedAction(run: RecordedRun, turn: number): string | null {
  const a = run.events.find((e) => e.type === "assistant" && e.turn === turn);
  const c = a?.type === "assistant" ? a.tool_calls[0] : undefined;
  return c === undefined ? null : `${c.name} ${JSON.stringify(c.args)}`;
}
