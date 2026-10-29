import {isTownCenterText} from "./town-center-checkpoint.js";
// Decision-point probes (M6 of the harness-fixes worklog): rebuild the exact context a recorded turn
// was decided from, re-derive it under a different switch set, and sample the next tool call.
// Everything model-facing is rebuilt by the harness's own code fed with the recorded event stream:
// the loop guard, supervisor, stall briefing, navigation memory, ledger and hint through the play
// wiring; press results through pressResult; readouts through the server's renderer (env rerender.py).
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, Message, TextContent, ThinkingContent, Tool, ToolCall, ToolResultMessage } from "@mariozechner/pi-ai";
import type {PlaceSource} from "./story-destinations.js";
import { checkEvent, type Button, type EventBody, type LoopBreakerBody, type RunEvent } from "./events.js";
import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featuresOf, type FeatureSet, type SwitchableFeature } from "./features.js";
import type { GameStateSnapshot } from "./game-state.js";
import { GATEWAY_PROVIDER } from "./gateway.js";
import { gameTools } from "./game-tools.js";
import { Governor, NUDGE, attachLoopGuard, slideWindow, withoutTextOnlyReplies } from "./harness.js";
import { cutOffReplyNotice } from "./cut-off-reply.js";
import type { LoopNotice } from "./loop-detection.js";
import { PLAY_LIMITS, PLAY_TASK, playSystemPrompt, targetGoal, toolSwitches } from "./play-config.js";
import { contextTools, loopSupervisor, playGameTools, stallBriefing, trustOptions } from "./play-wiring.js";
import { HarnessTrust, TRUST_HEADER, awayText } from "./harness-trust.js";
import type { Place } from "./story-destinations.js";
import { starterDecisionText } from "./starter-decision.js";
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
  return parseRunLines(text.split("\n"));
}
// The same parse over lines read one at a time, for event logs larger than one string can hold.
export function parseRunLines(lines: Iterable<string>): RecordedRun {
  const events: RunEvent[] = [];
  for (const line of lines) if (line.trim() !== "") events.push(checkEvent(JSON.parse(line)));
  return recordedRun(events);
}
export function recordedRun(events: RunEvent[]): RecordedRun {
  const start = events.find((e): e is RunStartEvent => e.type === "run_start");
  if (start === undefined) throw new Error("event log has no run_start");
  return { events, start };
}
export function recordedFeatures(run: RecordedRun): FeatureSet {
  if(run.start.harness_features.includes("player-map-visibility-v1"))throw new Error("Cannot reconstruct retired player-map-visibility-v1; use recorded frames and tool results for historical replay.");
  return featuresOf(run.start.harness_features);
}
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
  /** The game's map table read from a recorded raw-RAM archive, as GET /pokebench/places serves it; used by --trust-header and checkpoint guidance. */
  readonly places?: (ref: RawRef, features: FeatureSet) => Promise<readonly Place[]>;
}

export interface DecisionContext {
  readonly turn: number;
  readonly systemPrompt: string;
  readonly messages: readonly Message[];
  readonly tools: readonly Tool[];
  readonly size: ContextSize;
  /** --recorded-trim: the request measured where the run's recorder measured it (its turn_start context). */
  readonly recorderSize?: ContextSize;
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

async function resultTexts(parts: readonly ResultParts[], recorded: FeatureSet, features: FeatureSet, ports: ProbePorts, visible: ReadonlySet<number>, rerender: boolean, compositeReadouts: "party-menu-message-v1" | null): Promise<Map<number, string>> {
  const texts = new Map<number, string>();
  const partyOnly = compositeReadouts === "party-menu-message-v1" && SWITCHABLE_FEATURES.every((id) => id === compositeReadouts || recorded[id] === features[id]);
  const auto = parts.find((p) => p.auto && (AUTO_TEXT.some((id) => recorded[id] !== features[id]) || (rerender && visible.has(p.event.seq) && !partyOnly)));
  if (auto !== undefined) throw new Error(`tool_result seq ${String(auto.event.seq)} was auto-advanced through dialogue; its text cannot be re-derived under these switches yet`);
  const composite = parts.filter((p) => p.auto && rerender && visible.has(p.event.seq));
  if (composite.some((p) => p.event.is_error || p.after?.raw_ram === undefined || (p.event.text.match(/^Screen: /gm)?.length ?? 0) !== 1)) throw new Error("composite result has no supported final readout/raw RAM");
  const shown = new ShownStates();
  const switches = toolSwitches(features);
  const rendered = parts.filter((p) => rerender && visible.has(p.event.seq) && p.after?.raw_ram !== undefined && READOUT.test(p.event.text));
  const readouts = rendered.length === 0 ? [] : await ports.rerender(rendered.map((p) => ({ path: p.after?.raw_ram?.path ?? "", sha256: p.after?.raw_ram?.sha256 ?? "" })), features);
  const fresh = new Map(rendered.map((p, i) => [p.event.seq, readouts[i] ?? ""]));
  for (const part of parts) {
    let text = part.event.text;
    if (part.auto) {
      if (rerender && visible.has(part.event.seq)) {
        const readout = fresh.get(part.event.seq);
        if (readout === undefined || !readout.startsWith("Screen: ")) throw new Error("composite result has no reconstructed final readout");
        text = text.slice(0, text.search(READOUT)) + readout;
      }
      if (part.after !== undefined) shown.record(part.after);
      texts.set(part.event.seq, part.event.is_error?text:starterDecisionText(text,part.after??null,features["starter-decision-salience-v1"]));
      continue;
    }
    const readout = fresh.get(part.event.seq);
    if (readout !== undefined) text = text.slice(0, text.search(READOUT)) + readout;
    if (part.buttons !== null && part.after !== undefined && part.event.name === "press" && !part.event.is_error) {
      const before: GameStateSnapshot | undefined = part.before;
      text = pressLine(text, switches.pressResult ? `Press result: ${pressResult(before, part.after, part.buttons, switches, shown)}` : null);
    }
    if (part.after !== undefined && !part.event.is_error) shown.record(part.after, part.event.name === "press" ? part.before : undefined);
    texts.set(part.event.seq, part.event.is_error?text:starterDecisionText(text,part.after??null,features["starter-decision-salience-v1"]));
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
  readonly recordLedgerContext = (body: Omit<Extract<EventBody, { type: "ledger_context" }>, "type">): void => { this.own({ type: "ledger_context", ...body }, body.instruction_goals===undefined?this.upcoming:this.current.turn); };
  readonly recordMilestoneHint = (body: Omit<Extract<EventBody, { type: "milestone_hint" }>, "type">): void => { this.own({ type: "milestone_hint", ...body }, this.upcoming); };
  readonly recordBeliefLedger = (body: Omit<Extract<EventBody, { type: "belief_ledger" }>, "type">): void => { this.own({ type: "belief_ledger", ...body }, this.upcoming); };
  readonly recordLoopBreaker = (body: LoopBreakerBody): void => { this.own({ type: "loop_breaker", ...body }, this.upcoming); };
  readonly recordStallGate = (body: Omit<Extract<EventBody, { type: "stall_gate" }>, "type" | "turn">): void => { this.own({ type: "stall_gate", ...body, map_id: [body.map_id[0], body.map_id[1]] }, this.current.turn); };
  // Tool construction ports; a probe never executes a tool.
  readonly recordState = (): never => { throw new Error("probe tools never execute"); };
  readonly recordDialogueAutoAdvance = (): never => { throw new Error("probe tools never execute"); };
  readonly lowHpTrainerWarning = (): never => { throw new Error("probe tools never execute"); };
  readonly peopleIdCard = (): never => { throw new Error("probe tools never execute"); };
  readonly storyBattleWarning = (): never => { throw new Error("probe tools never execute"); };
  readonly healBeforeTrainersWarning = (): never => { throw new Error("probe tools never execute"); };
  readonly healFirstLine = (): never => { throw new Error("probe tools never execute"); };
  readonly storyGoalAway = (): never => { throw new Error("probe tools never execute"); };
  readonly destinationCitation = (): never => { throw new Error("probe tools never execute"); };
}
// What the wiring itself records; the replay regenerates these instead of reading them.
const DERIVED: readonly RunEvent["type"][] = ["loop_guard", "navigation_context", "ledger_context", "milestone_hint", "text_only_supervisor", "belief_ledger", "loop_breaker", "stall_gate"];

const inert = (): Promise<never> => Promise.reject(new Error("probe tools never execute"));

export function probeTools(features: FeatureSet, recorder: Replay, cutOff?:string, innermost: (m: AgentMessage[]) => Promise<AgentMessage[]> = (m) => Promise.resolve(m), places:PlaceSource={}): { tools: AgentTool[]; transform: (m: AgentMessage[]) => Promise<AgentMessage[]>; window: ReturnType<typeof contextTools>["window"] } {
  const base = gameTools("http://probe.invalid", { beforePress: () => undefined, afterPress: inert }, inert, toolSwitches(features));
  const context = contextTools(features, recorder, innermost, cutOff,places);
  const tools = playGameTools(base, features, { read: inert, battleWait: inert, battleMessages: inert, sceneEvents: inert }, recorder,undefined,features["instruction-goal-ledger-v1"]?context.tools:[],context.training,context.instructionGoals);
  return { tools: [...tools, ...(features["instruction-goal-ledger-v1"]?[]:context.tools)], transform: context.transformContext, window: context.window };
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
// The follow-up after a reply with no tool call: a recorded text-only note when it came after this reply, else
// the cut-off notice (cut-off-reply-feedback-v1) for a reply that stopped at max_tokens, else NUDGE.
export function followUpText(reply: { readonly seq: number; readonly stop_reason: string }, supervised: { readonly seq: number; readonly text: string } | undefined, cutOff: string | undefined, supervisorReplay?: { readonly cutOff: string | undefined }): string {
  if (supervised !== undefined && supervised.seq > reply.seq) {
    if (supervisorReplay === undefined || reply.stop_reason !== "length") return supervised.text;
    const prefix = supervisorReplay.cutOff === undefined ? undefined : `${supervisorReplay.cutOff}\n`;
    const briefing = prefix !== undefined && supervised.text.startsWith(prefix) ? supervised.text.slice(prefix.length) : supervised.text;
    return cutOff === undefined ? briefing : `${cutOff}\n${briefing}`;
  }
  return reply.stop_reason === "length" && cutOff !== undefined ? cutOff : NUDGE;
}

function conversation(prior: readonly RunEvent[], goal: string | null, byId: ReadonlyMap<string, ToolResultEvent>, notes: readonly Extract<RunEvent, { type: "text_only_supervisor" }>[], texts: ReadonlyMap<number, string>, ports: ProbePorts, model: string, cutOff: string | undefined, atTurn?:(turn:number,history:readonly Message[])=>void, supervisorReplay?: { readonly cutOff: string | undefined }): Message[] {
  const history: Message[] = [{ role: "user", content: goal === null ? PLAY_TASK : `The game has just booted. ${targetGoal(goal)}`, timestamp: 0 }];
  let note = 0;
  for (const e of prior) {
    if(e.type==="turn_start")atTurn?.(e.turn,[...history]);
    if (e.type !== "assistant" || e.stop_reason === "error" || e.stop_reason === "aborted") continue;
    const content: (TextContent | ThinkingContent | ToolCall)[] = [];
    if (e.thinking !== "") content.push({ type: "thinking", thinking: e.thinking, thinkingSignature: ports.thinkingSignature });
    if (e.text !== "") content.push({ type: "text", text: e.text });
    for (const c of e.tool_calls) content.push({ type: "toolCall", id: c.id, name: c.name, arguments: c.args as Record<string, unknown> });
    const assistant: AssistantMessage = { role: "assistant", content, api: "openai-completions", provider: GATEWAY_PROVIDER, model, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: e.stop_reason, timestamp: 0 };
    history.push(assistant);
    if (e.tool_calls.length === 0) {
      const supervised = notes[note]?.turn === e.turn ? notes[note] : undefined;
      const text = followUpText(e, supervised, cutOff, supervisorReplay);
      if (supervised !== undefined && supervised.seq > e.seq) note += 1;
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

/** Persistent conversation before request transforms/windowing, shared by checkpoint continuation qualification. */
export function recordedConversation(run:RecordedRun,ports:ProbePorts,atTurn?:(turn:number,history:readonly Message[])=>void):Message[]{
 const prior=run.events;const start=run.start;
 const results=prior.filter((e):e is ToolResultEvent=>e.type==="tool_result");
 const notes=prior.filter((e):e is Extract<RunEvent,{type:"text_only_supervisor"}>=>e.type==="text_only_supervisor");
 const goal=start.evaluation?.goal_target??start.evaluation?.target??null;
 return conversation(prior,goal,new Map(results.map(r=>[r.id,r])),notes,new Map(),ports,start.model.id,cutOffReplyNotice(recordedFeatures(run),start.sampling.max_tokens),atTurn);
}

/** `recorded` rebuilds what the model saw then (recorded notes, guard text and tool results); `replayed` re-derives all of it with today's code under `features`. */
export type Derivation = "recorded" | "replayed";
/** `rerender` re-renders every readout still in the window from raw RAM with today's renderer; the probe sets it in both arms whenever a server switch flips, so the arms differ only by the switch. */
// --trust-header: harness-trust-v1's header is baked into each recorded result. Re-derive what story switches change in it,
// the Story goal line and the walk-away note, by replaying the recorded events through HarnessTrust with the arm's
// switches. The header's other lines (story characters, exits, people) come from parts of the result the recording joined,
// so they are kept as recorded, and an arm that changes the switches behind them is refused.
const TRUST_TOOLS = new Set(["observe", "press", "navigate_to"]);
const KEPT_LINE_SWITCHES: readonly SwitchableFeature[] = ["harness-trust-v2", "semantic-navigation-v2", "character-presence-v1", "exit-reachability-v1", "exit-labels-v3", "untalked-people-header-v1", "displayed-place-names-v1"];
const GOAL_LINE = /^(Story goal: |Story line heard |Historical named place evidence: )/;
const AWAY_NOTE = /^SUPERVISOR: /;
// The recorded header with its goal line and walk-away note replaced: `fresh` is the re-derived header (goal line second).
function spliceHeader(recorded: readonly string[], fresh: readonly string[], note: string | null): string[] {
  const goal = fresh.filter((line) => GOAL_LINE.test(line));
  const rest = recorded.slice(1).filter((line) => !GOAL_LINE.test(line) && !AWAY_NOTE.test(line));
  return [TRUST_HEADER, ...goal, ...rest, ...(note === null ? [] : [note])];
}
export async function rederiveTrustHeaders(prior: readonly RunEvent[], texts: Map<number, string>, features: FeatureSet, recorded: FeatureSet, ports: ProbePorts, kept: ReadonlySet<number>): Promise<void> {
  if (!features["harness-trust-v1"] || !recorded["harness-trust-v1"]) throw new Error("--trust-header re-derives harness-trust-v1's header, which both the run and the arm must have on");
  const changed = KEPT_LINE_SWITCHES.filter((id) => features[id] !== recorded[id]);
  if (changed.length > 0) throw new Error(`--trust-header keeps the recorded header's other lines, so the arm must leave ${changed.join(", ")} as recorded`);
  const read = ports.places;
  if (read === undefined) throw new Error("--trust-header needs the game's map table (the places port)");
  const options = trustOptions(features);
  const trust = new HarnessTrust(options);
  const states = new Map<number, StateEvent>();
  const tables = new Map<string, Promise<readonly Place[]>>();
  const annotated = (name: string): boolean => TRUST_TOOLS.has(name) || (options.battleAction === true && name === "battle_action") || (options.semanticTargets === true && (name === "navigate_to_target" || name === "explore_map"));
  // The recorder writes a result's own after-state (and what it emits with it) once the wrapped tool has returned, so
  // after the header was printed: those events reach HarnessTrust only after their result's header is derived.
  const afterStates = new Set(prior.flatMap((e) => (e.type === "tool_result" && e.state_seq !== undefined ? [e.state_seq] : [])));
  let deferred: RunEvent[] = [];
  for (const e of prior) {
    if (e.type === "state" && "started" in e) states.set(e.seq, e);
    if (afterStates.has(e.seq) || (deferred.length > 0 && e.type !== "tool_result")) { deferred.push(e); continue; }
    const after = e.type === "tool_result" && e.state_seq !== undefined ? states.get(e.state_seq) : undefined;
    const text = e.type === "tool_result" ? texts.get(e.seq) ?? e.text : null;
    // Every annotated result advances HarnessTrust (its walk-away count), as in the run; only kept ones are rewritten.
    if (e.type === "tool_result" && !e.is_error && annotated(e.name) && after?.started === true && after.raw_ram !== undefined && text !== null && text.startsWith(`${TRUST_HEADER}\n`)) {
      const cut = text.indexOf("\n\n");
      if (cut < 0) throw new Error(`tool_result seq ${String(e.seq)} has a trust header with no body`);
      const body = text.slice(cut + 2);
      const player = after.name ?? "";
      let table = tables.get(player);
      if (table === undefined) { table = read({ path: after.raw_ram.path, sha256: after.raw_ram.sha256 }, features); tables.set(player, table); }
      const walk = e.name === "navigate_to" || (options.semanticTargets === true && (e.name === "navigate_to_target" || e.name === "explore_map"));
      const { header, away } = trust.lines(body, after, e.id, await table, e.name === "press" || walk, body);
      if (kept.has(e.seq)) texts.set(e.seq, `${spliceHeader(text.slice(0, cut).split("\n"), header.split("\n"), away === null ? null : awayText(away)).join("\n")}\n\n${body}`);
    }
    for (const d of deferred) trust.observe(d);
    deferred = [];
    trust.observe(e);
  }
}

// --recorded-trim: the run's context-token-budget-v1 dropped its oldest assistant turns to fit the model's window, and
// turn_start recorded the request at the innermost context transform, where the live recorder sits. The probe measures
// at the same place: whole turns are dropped the same way until the request measured there has the recorded message and
// image counts. A rebuild no cut matches is refused with the delta, so a probe never samples a context the run did not send.
export async function trimToRecorded(messages: readonly AgentMessage[], warning: string | null, recorded: ContextSize, measure: (kept: AgentMessage[]) => Promise<ContextSize>): Promise<AgentMessage[]> {
  const [task, ...rest] = messages;
  if (task === undefined) throw new Error("--recorded-trim: the rebuilt history is empty");
  const withWarning = (kept: AgentMessage[]): AgentMessage[] => (warning === null ? kept : [...kept, { role: "user", content: warning, timestamp: 0 }]);
  const starts = [0, ...rest.flatMap((message, i) => (i > 0 && message.role === "assistant" ? [i] : []))];
  const seen: string[] = [];
  for (const start of starts) {
    const kept = [task, ...rest.slice(start)];
    const size = await measure(withWarning(kept));
    if (size.messages === recorded.messages && size.images === recorded.images) return kept;
    seen.push(`${String(size.messages)}/${String(size.images)}`);
  }
  throw new Error(`--recorded-trim: no whole-turn cut of the rebuilt request matches the recorded one (${String(recorded.messages)} messages, ${String(recorded.images)} images); cuts measured messages/images ${seen.join(", ")}`);
}

export async function decisionContext(run: RecordedRun, turn: number, features: FeatureSet, ports: ProbePorts, derivation: Derivation = "replayed", rerender = false, compositeReadouts: "party-menu-message-v1" | null = null, trustHeader = false, recordedTrim = false): Promise<DecisionContext> {
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
  const goal = start.evaluation?.goal_target !== undefined ? start.evaluation.goal_target : start.evaluation?.target ?? null;
  const byId = new Map(results.map((r) => [r.id, r]));
  const notes = prior.filter((e): e is Extract<RunEvent, { type: "text_only_supervisor" }> => e.type === "text_only_supervisor");
  const window = contextTools(features, new Replay(start), (m) => Promise.resolve(m)).window;
  const cutOff = cutOffReplyNotice(features, start.sampling.max_tokens);
  const recordedHistory = conversation(prior, goal, byId, notes, new Map(), ports, start.model.id, cutOff);
  // Only results the window keeps whole are shown in full, so only those are re-derived.
  const kept = new Set(slideWindow(recordedHistory, window).flatMap((m) => (m.role === "toolResult" && m.content.some((p) => p.type === "text" && p.text === byId.get(m.toolCallId)?.text) ? [byId.get(m.toolCallId)?.seq ?? -1] : [])));
  const texts = derivation === "recorded" ? new Map<number, string>() : await resultTexts(parts, recorded, features, ports, kept, rerender, compositeReadouts);
  if (trustHeader) {
    if (derivation === "recorded") throw new Error("--trust-header re-derives the header, so it needs the replayed derivation");
    await rederiveTrustHeaders(prior, texts, features, recorded, ports, kept);
  }
  const history = derivation === "recorded" ? recordedHistory : conversation(prior, goal, byId, notes, texts, ports, start.model.id, cutOff, undefined, {cutOff:cutOffReplyNotice(recorded,start.sampling.max_tokens)});
  if (derivation === "recorded") {
    const wiring = probeTools(features, new Replay(start),cutOff);
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
  const detector = attachLoopGuard(replay, governor, undefined, features["deterministic-loop-guard-v1"] ? "enforced" : "diagnostic", features["interaction-loop-detection-v1"], loopSupervisor(features, replay), features["transition-loop-detection-v1"], features["pushback-loop-detection-v1"], features["battle-observation-loop-v1"], features["navigation-truth-v1"], features["ineffective-loops-v1"], features["battle-menu-loop-v1"], features["clock-view-loop-v1"], features["reopened-dialogue-loop-v1"],features["trigger-script-loop-v1"],features["battle-refusal-loop-v1"],features["ineffective-navigation-v2"],features["same-target-no-progress-v1"],features);
  const t0 = Date.parse(start.t);
  stallBriefing(features, replay, detector, { pausedMs: () => 0 }, () => Date.parse(replay.current.t) - t0);
  // --recorded-trim measures each candidate request where the live recorder sat: the innermost context transform.
  const recorderView: { size: ContextSize | null } = { size: null };
  const lastMeasured = (): ContextSize | null => recorderView.size;
  const source:PlaceSource={places:async()=>{const state=prior.findLast((e):e is Extract<RunEvent,{type:"state";started:boolean}>=>e.type==="state"&&"started" in e&&e.raw_ram!==undefined);if(state?.raw_ram===undefined||ports.places===undefined)return null;return {places:await ports.places(state.raw_ram,features)};}};
  const wiring = probeTools(features, replay, cutOff, (m) => { recorderView.size = contextSize(m.filter(isMessage)); return Promise.resolve(m); },source);
  for (const e of prior) {
    if (DERIVED.includes(e.type)&&!(features["instruction-goal-ledger-v1"]&&e.type==="ledger_context"&&e.instruction_goals!==undefined)&&!(features["town-center-checkpoint-v1"]&&e.type==="ledger_context"&&isTownCenterText(e.text))) continue;
    if (e.type === "turn_start") { replay.upcoming = e.turn; detector.context(); await wiring.transform([]); }
    replay.dispatch(e);
  }
  replay.upcoming = target.turn;
  const warning = detector.context();
  const slid = slideWindow(history, wiring.window);
  const windowed = recordedTrim ? await trimToRecorded(slid, warning, target.context, async (kept) => { recorderView.size = null; await wiring.transform(kept); const size = lastMeasured(); if (size === null) throw new Error("--recorded-trim: the context transform never reached its innermost step"); return size; }) : slid;
  if (warning !== null) windowed.push({ role: "user", content: warning, timestamp: 0 });
  recorderView.size = null;
  const messages = (await wiring.transform(windowed)).filter(isMessage);
  const recorderSize = recordedTrim ? lastMeasured() : null;
  return { turn, systemPrompt: playSystemPrompt(features, goal), messages, tools: wiring.tools.map(asTool), size: contextSize(messages), ...(recorderSize === null ? {} : { recorderSize }) };
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
  const own = prior.filter((e) => e.turn === turn && (e.type === "navigation_context" || e.type === "ledger_context"&&!isTownCenterText(e.text))).flatMap((e) => (e.type === "ledger_context" || e.type === "navigation_context" ? [e.text] : []));
  // disproved-beliefs-v1 wraps the hint in the context chain, so its message comes before the pinned hint.
  const beliefs = prior.filter((e) => e.turn === turn && e.type === "belief_ledger").flatMap((e) => (e.type === "belief_ledger" ? [e.text] : []));
  // A checkpoint receipt is one per visit; text-only/error retries retain its exact transient note.
  let town:string|null=null;
  for(const e of prior){
    if(e.type==="state"||e.type==="tool_result"||e.type==="assistant"&&e.stop_reason!=="error"&&e.stop_reason!=="aborted"&&e.tool_calls.length>0)town=null;
    if(e.type==="ledger_context"&&e.turn<=turn&&isTownCenterText(e.text))town=e.text;
  }
  return [...(guard === null ? [] : [guard]), ...beliefs, ...(hint === null ? [] : [hint]), ...own,...(town===null?[]:[town])];
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
