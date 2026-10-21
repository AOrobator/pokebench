import {
  runAgentLoop,
  runAgentLoopContinue,
  type AgentEvent,
  type AgentLoopConfig,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from "@mariozechner/pi-agent-core";
import { createAssistantMessageEventStream, streamSimple, type Context, type Api, type AssistantMessage, type Model, type ToolResultMessage } from "@mariozechner/pi-ai";
import { LoopDetector, type LoopKind, type LoopPolicy, type LoopMode } from "./loop-detection.js";
import type { RunRecorder } from "./recorder.js";
import type { RunEndReason } from "./events.js";
import type { FeatureSet } from "./features.js";
import type { BudgetTrim, ContextBudget } from "./context-budget.js";

export interface Chunked {
  readonly max: number;
  readonly chunk: number;
}

export interface Window {
  readonly turns: Chunked;
  readonly results: Chunked;
  // dialogue-context-kept-v1: a collapsed result keeps every dialogue page it showed.
  readonly keepDialogue?: boolean;
  readonly alignCuts?: boolean;
}

// Boundaries move in whole chunks so the start of the prompt stays identical
// for several turns and the inference server can reuse its prompt cache.
export const WINDOW: Window = { turns: { max: 20, chunk: 10 }, results: { max: 6, chunk: 3 } };
export const DOUBLE_WINDOW: Window = { turns: { max: 40, chunk: 20 }, results: { max: 12, chunk: 6 } };

export function contextWindow(features: FeatureSet): Window {
  const window = features["double-context-window-v1"] ? DOUBLE_WINDOW : WINDOW;
  const legacy = features["dialogue-context-kept-v1"] ? { ...window, keepDialogue: true } : window;
  return features["cache-aligned-window-v1"] ? { ...legacy, alignCuts: true } : legacy;
}
export const OMITTED_FRAME = "[older screenshot omitted]";
export const NUDGE = "Keep playing: call observe or press. Only tool calls advance the game.";
// text-only-supervisor-v2: the nudge after the last note.
export const TEXT_ONLY_REMINDER = "SUPERVISOR: No tool was called. Keep the next reply short and end it with one listed game tool call. The configured run budgets and stopping policy still apply.";
// text-only-supervisor-v1: notes in a row, with no successful tool call between them, before the run ends.
export const TEXT_ONLY_NOTE_LIMIT = 3;

export function keepCount(n: number, { max, chunk }: Chunked): number {
  if (n <= max) return n;
  const base = max - chunk;
  return base + ((n - base - 1) % chunk) + 1;
}

function summary(text: string): string {
  const location = /^(?:Current )?Location: (.+)$/m.exec(text)?.[1];
  const position = /^Position: (.+)$/m.exec(text)?.[1];
  const [first = ""] = text.split("\n");
  if (location === undefined) return first;
  const action = first.startsWith("pressed ") || first.startsWith("Navigation: ") ? first : "observed";
  return `${action} · ${location}${position === undefined ? "" : ` (${position})`}`;
}

// Tools whose whole result is quoted dialogue.
const DIALOGUE_TOOLS = new Set(["get_dialogue", "recall_dialogue"]);
const PAGE_LIST = /^Dialogue shown during this call \((\d+) pages?, in order, whole\):$/gm;

// Every dialogue unit a result showed, byte for byte and in order: an auto-advance page list (header and
// every numbered page, which can span lines) and each readout `Dialog: "…"` line (one line; the server
// joins pages with " | ").
export function dialogueUnits(text: string): string[] {
  const units: { at: number; text: string }[] = [];
  for (const header of text.matchAll(PAGE_LIST)) {
    const count = Number(header[1]);
    const lastPage = text.indexOf(`\n${String(count)}. turn `, header.index);
    const close = lastPage < 0 ? -1 : text.indexOf('"\n\n', lastPage);
    const end = close < 0 ? text.length : close + 1;
    units.push({ at: header.index, text: text.slice(header.index, end) });
  }
  for (const line of text.matchAll(/^Dialog: ".*"$/gm)) units.push({ at: line.index, text: line[0] });
  return units.sort((a, b) => a.at - b.at).map((unit) => unit.text);
}

function collapsed(message: ToolResultMessage, keepDialogue: boolean): ToolResultMessage {
  const text = message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
  const hadImage = message.content.some((part) => part.type === "image");
  const line = hadImage ? `${summary(text)} ${OMITTED_FRAME}` : summary(text);
  if (!keepDialogue) return { ...message, content: [{ type: "text", text: line }] };
  if (DIALOGUE_TOOLS.has(message.toolName)) return { ...message, content: [{ type: "text", text }] };
  const kept = dialogueUnits(text);
  return { ...message, content: [{ type: "text", text: kept.length === 0 ? line : [line, ...kept].join("\n") }] };
}

// Replay canonical request boundaries so cuts remain stable as the history grows.
// A nearby result rewrite can absorb a history cut, without raising either cap.
function alignedFrom(rest: AgentMessage[], window: Window): number {
  const starts: number[] = [];
  let from = 0, results = 0, previousCollapse = 0;
  const boundary = (): void => {
    const collapse = results - keepCount(results, window.results);
    const retained = starts.length - from;
    const nearCap = Math.max(1, window.turns.max - window.results.chunk + 1);
    if (retained > window.turns.max || (collapse > previousCollapse && retained >= nearCap)) {
      from = Math.max(from, starts.length - (window.turns.max - window.turns.chunk + 1));
    }
    previousCollapse = collapse;
  };
  rest.forEach((message, index) => {
    if (message.role === "assistant") { boundary(); starts.push(index); }
    if (message.role === "toolResult") results += 1;
  });
  boundary();
  return starts[from] ?? 0;
}

export function slideWindow(messages: AgentMessage[], window: Window = WINDOW): AgentMessage[] {
  const [task, ...rest] = messages;
  if (task === undefined) return messages;
  const results = rest.filter((message) => message.role === "toolResult").length;
  let collapse = results - keepCount(results, window.results);
  const shown = rest.map((message) => {
    if (message.role !== "toolResult" || collapse <= 0) return message;
    collapse -= 1;
    return collapsed(message, window.keepDialogue === true);
  });
  const starts = shown.flatMap((message, i) => (message.role === "assistant" ? [i] : []));
  const from = window.alignCuts === true ? alignedFrom(rest, window) : starts[starts.length - keepCount(starts.length, window.turns)] ?? 0;
  return [task, ...shown.slice(from)];
}

// A reply that called no tool, left out of what the model is sent next, so a
// retry is a fresh sample rather than a continuation of the failed reply.
export function withoutTextOnlyReplies(messages: AgentMessage[]): AgentMessage[] {
  return messages.filter((message) => message.role !== "assistant" || message.content.some((part) => part.type === "toolCall"));
}

export interface Limits {
  readonly maxTurns: number;
  readonly maxWallMs: number;
  readonly failureLimit: number;
  // false: only consecutive model errors end the run; text-only, cut-off and invalid replies never do.
  readonly replyFailuresEndRun?: boolean;
}

export interface GovernorDeps {
  readonly limits: Limits;
  retry(reason: string, attempt: number, limit: number): void;
  abort(): void;
  readonly now: () => number;
  readonly startedAt?:number;
  // Operator control: a stop due at this turn end, and time spent paused.
  readonly takeStop?: () => boolean;
  readonly pausedMs?: () => number;
  readonly wallLimit?: () => number;
  // text-only-supervisor-v1: a recorded note to send instead of ending the run (replies, note number).
  readonly textOnlySupervisor?: (replies: number, note: number) => string;
  readonly textOnlyReminder?: string;
}

export class Governor {
  private turns = 0;
  private failures = 0;
  private modelErrors = 0;
  private nudgeDue = false;
  private silent = 0;
  private notes = 0;
  private note: { replies: number; note: number } | null = null;
  private readonly startedAt: number;
  stopReason: RunEndReason | null = null;

  constructor(private readonly deps: GovernorDeps) {
    this.startedAt = deps.startedAt??deps.now();
  }

  readonly afterTurn = (message: AssistantMessage, toolResults: readonly ToolResultMessage[]): boolean => {
    if(this.stopReason!==null)return true;
    this.modelErrors = 0;
    const calls = message.content.filter((part) => part.type === "toolCall").length;
    this.nudgeDue = calls === 0;
    const invalid = toolResults.length > 0 && toolResults.every((result) => result.isError);
    this.silent = calls === 0 ? this.silent + 1 : 0;
    if (message.stopReason === "length") this.fail("reply hit max_tokens");
    else if (calls === 0) this.fail("text-only reply");
    else if (invalid) this.fail(`invalid tool call: ${firstText(toolResults[0])}`);
    else { this.failures = 0; this.notes = 0; }
    return this.countTurn();
  };

  modelError(message: AssistantMessage): boolean {
    if(this.stopReason!==null)return true;
    this.silent = 0;
    this.modelErrors += 1;
    this.fail(`model error: ${message.errorMessage ?? message.stopReason}`);
    return this.countTurn();
  }

  readonly followUps = (): Promise<AgentMessage[]> => Promise.resolve(this.nudge());

  stop(reason: RunEndReason):void {this.stopReason??=reason;}

  abort(reason: RunEndReason): void {
    if(this.stopReason==="milestone")return;
    this.stopReason ??= reason;
    this.deps.abort();
  }

  private nudge(): AgentMessage[] {
    if (!this.nudgeDue || this.stopReason !== null) return [];
    this.nudgeDue = false;
    const due = this.note;
    this.note = null;
    // The note is built, and recorded, only when it is actually delivered.
    const content = due === null || this.deps.textOnlySupervisor === undefined ? (this.notes>=TEXT_ONLY_NOTE_LIMIT?this.deps.textOnlyReminder??NUDGE:NUDGE) : this.deps.textOnlySupervisor(due.replies, due.note);
    return [{ role: "user", content, timestamp: Date.now() }];
  }

  private fail(reason: string): void {
    this.failures += 1;
    this.deps.retry(reason, this.failures, this.deps.limits.failureLimit);
    if (this.failures < this.deps.limits.failureLimit) return;
    // Only a streak made entirely of replies with no tool call earns a note instead of the stop.
    if (this.deps.textOnlySupervisor !== undefined && this.silent >= this.failures && this.notes < TEXT_ONLY_NOTE_LIMIT) {
      this.notes += 1;
      this.note = { replies: this.silent, note: this.notes };
      this.failures = 0;
      this.silent = 0;
      return;
    }
    if (this.deps.limits.replyFailuresEndRun === false && this.modelErrors < this.failures) {
      // The trailing model errors stay counted, so three in a row still end the run.
      this.failures = this.modelErrors;
      this.silent = 0;
      return;
    }
    this.stopReason ??= "model_error";
  }

  private countTurn(): boolean {
    this.turns += 1;
    const { maxTurns, maxWallMs } = this.deps.limits;
    if (this.deps.takeStop?.() === true) this.stopReason ??= "operator_stop";
    const active = this.deps.now() - this.startedAt - (this.deps.pausedMs?.() ?? 0);
    if (this.turns >= maxTurns || active >= (this.deps.wallLimit?.() ?? maxWallMs)) this.stopReason ??= "budget";
    return this.stopReason !== null;
  }
}

function firstText(result: ToolResultMessage | undefined): string {
  const part = result?.content.find((p) => p.type === "text");
  return part?.type === "text" ? part.text : "";
}

export function attachLoopGuard(recorder: Pick<RunRecorder, "subscribe" | "recordLoopGuard">, governor: Governor, policy?: LoopPolicy, mode:LoopMode="enforced", interactions=false, supervisor?: (kind: LoopKind, calls: number) => string, transitions=false, pushback=false, battles=false, messageTruth=false, ineffectiveLoops=false, menuLoop=false, clockViews=false, closedDialogue=false,triggerScriptLoops=false,battleRefusals=false,ineffectiveNavigation=false,sameTargetNoProgress=false,features?:Pick<FeatureSet,"menu-refusal-recovery-v1">): LoopDetector {
  const detector = new LoopDetector((notice) => {
    recorder.recordLoopGuard({...notice,evidence:[...notice.evidence]});
    if (notice.phase === "stop") governor.abort("stuck");
  }, policy, mode, interactions, supervisor, transitions, pushback, battles, messageTruth, ineffectiveLoops, menuLoop, clockViews, closedDialogue,triggerScriptLoops,battleRefusals,ineffectiveNavigation,sameTargetNoProgress,features?.["menu-refusal-recovery-v1"]??false);
  recorder.subscribe((event) => { detector.observe(event); });
  return detector;
}

export interface Loop {
  start(prompts: AgentMessage[], messages: AgentMessage[]): Promise<AgentMessage[]>;
  resume(messages: AgentMessage[]): Promise<AgentMessage[]>;
}

export interface PiLoopOptions {
  readonly systemPrompt: string;
  readonly tools: AgentTool[];
  readonly base: AgentLoopConfig;
  readonly governor: Governor;
  readonly transformContext: (messages: AgentMessage[]) => Promise<AgentMessage[]>;
  readonly emit: (event: AgentEvent) => Promise<void> | void;
  readonly signal: AbortSignal;
  readonly streamFn?: StreamFn;
  readonly requestContext?: (context: Context) => Context;
  readonly loopDetector?: LoopDetector | undefined;
  readonly window?: Window;
  // Awaited before every model call (operator pause).
  readonly gate?: (signal?: AbortSignal) => Promise<void>;
  // context-token-budget-v1: fits each request to the served context; each trim is reported after the turn starts.
  readonly budget?: ContextBudget;
  readonly onBudgetTrim?: (trim: BudgetTrim) => void;
}

function abortedReply(model: Model<Api>): AssistantMessage {
  return { role: "assistant", content: [], api: model.api, provider: model.provider, model: model.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "aborted", errorMessage: "Run ended before this model call", timestamp: Date.now() };
}

// A run that ended while held at the gate must not reach the model.
function streamFn(inner: StreamFn | undefined, requestContext?: (context: Context) => Context): StreamFn {
  return (model, context, options) => {
    if (options?.signal?.aborted === true) {
      const stream = createAssistantMessageEventStream();
      const message = abortedReply(model);
      stream.push({ type: "error", reason: "aborted", error: message });
      return stream;
    }
    return (inner ?? streamSimple)(model, requestContext?.(context) ?? context, options);
  };
}

export function piLoop(options: PiLoopOptions): Loop {
  const { systemPrompt, tools, governor, signal } = options;
  const budget = options.budget;
  const emit = budget === undefined ? options.emit : (event: AgentEvent): Promise<void> | void => {
    if (event.type === "message_end") budget.observe(event.message);
    return options.emit(event);
  };
  const model = streamFn(options.streamFn, options.requestContext);
  const config: AgentLoopConfig = {
    ...options.base,
    toolExecution: "sequential",
    transformContext: async (messages, loopSignal) => {
      await options.gate?.(loopSignal ?? signal);
      const warning = options.loopDetector?.context();
      const windowed = slideWindow(messages, options.window ?? WINDOW);
      const fitted = options.budget?.fit(windowed) ?? { messages: windowed, trim: null };
      const context = fitted.messages;
      if (warning) context.push({role:"user",content:warning,timestamp:Date.now()});
      const sent = await options.transformContext(context);
      if (fitted.trim !== null) options.onBudgetTrim?.(fitted.trim);
      return sent;
    },
    beforeToolCall: async (context, signal) => {
      if (options.loopDetector?.stopped) return {block:true,reason:"Loop guard stopped the run; no further tool execution."};
      if(governor.stopReason!==null)return {block:true,reason:`Run stopped: ${governor.stopReason}; no further tool execution.`};
      return options.base.beforeToolCall?.(context,signal);
    },
    shouldStopAfterTurn: ({ message, toolResults }) => governor.afterTurn(message, toolResults),
    getFollowUpMessages: governor.followUps,
  };
  return {
    start: (prompts, messages) =>
      runAgentLoop(prompts, { systemPrompt, messages, tools }, config, emit, signal, model),
    resume: (messages) => runAgentLoopContinue({ systemPrompt, messages, tools }, config, emit, signal, model),
  };
}

// A stop (operator abort, budget) aborts the loop's signal; an abort thrown where the loop does not catch it
// (pi's transformContext hook) rejects the loop, and that rejection is the stop, not a crash.
async function untilStopped(governor: Governor, pending: () => Promise<AgentMessage[]>): Promise<AgentMessage[] | RunEndReason> {
  try {
    return await pending();
  } catch (error) {
    if (governor.stopReason !== null) return governor.stopReason;
    throw error;
  }
}

export async function play(task: AgentMessage, governor: Governor, loop: Loop): Promise<RunEndReason> {
  const started = await untilStopped(governor, () => loop.start([task], []));
  if (typeof started === "string") return started;
  let messages = started;
  for (;;) {
    if (governor.stopReason !== null) return governor.stopReason;
    const last = messages.at(-1);
    if (last?.role !== "assistant" || (last.stopReason !== "error" && last.stopReason !== "aborted")) {
      throw new Error("agent loop ended without a stop reason");
    }
    messages = messages.slice(0, -1);
    if (governor.modelError(last)) continue;
    const more = await untilStopped(governor, () => loop.resume([...messages]));
    if (typeof more === "string") return more;
    messages = [...messages, ...more];
  }
}
