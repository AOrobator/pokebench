import {
  runAgentLoop,
  runAgentLoopContinue,
  type AgentEvent,
  type AgentLoopConfig,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import { LoopDetector, type LoopPolicy } from "./loop-detection.js";
import type { RunRecorder } from "./recorder.js";
import type { RunEndReason } from "./events.js";

export interface Chunked {
  readonly max: number;
  readonly chunk: number;
}

export interface Window {
  readonly turns: Chunked;
  readonly results: Chunked;
}

// Boundaries move in whole chunks so the start of the prompt stays identical
// for several turns and the inference server can reuse its prompt cache.
export const WINDOW: Window = { turns: { max: 20, chunk: 10 }, results: { max: 6, chunk: 3 } };
export const OMITTED_FRAME = "[older screenshot omitted]";
export const NUDGE = "Keep playing: call observe or press. Only tool calls advance the game.";

export function keepCount(n: number, { max, chunk }: Chunked): number {
  if (n <= max) return n;
  const base = max - chunk;
  return base + ((n - base - 1) % chunk) + 1;
}

function summary(text: string): string {
  const location = /^Current Location: (.+)$/m.exec(text)?.[1];
  const position = /^Position: (.+)$/m.exec(text)?.[1];
  const [first = ""] = text.split("\n");
  if (location === undefined) return first.slice(0, 200);
  const action = first.startsWith("pressed ") ? first : "observed";
  return `${action} · ${location}${position === undefined ? "" : ` (${position})`}`;
}

function collapsed(message: ToolResultMessage): ToolResultMessage {
  const text = message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
  const hadImage = message.content.some((part) => part.type === "image");
  return { ...message, content: [{ type: "text", text: hadImage ? `${summary(text)} ${OMITTED_FRAME}` : summary(text) }] };
}

export function slideWindow(messages: AgentMessage[], window: Window = WINDOW): AgentMessage[] {
  const [task, ...rest] = messages;
  if (task === undefined) return messages;
  const results = rest.filter((message) => message.role === "toolResult").length;
  let collapse = results - keepCount(results, window.results);
  const shown = rest.map((message) => {
    if (message.role !== "toolResult" || collapse <= 0) return message;
    collapse -= 1;
    return collapsed(message);
  });
  const starts = shown.flatMap((message, i) => (message.role === "assistant" ? [i] : []));
  const from = starts[starts.length - keepCount(starts.length, window.turns)] ?? 0;
  return [task, ...shown.slice(from)];
}

export interface Limits {
  readonly maxTurns: number;
  readonly maxWallMs: number;
  readonly failureLimit: number;
}

export interface GovernorDeps {
  readonly limits: Limits;
  retry(reason: string, attempt: number, limit: number): void;
  abort(): void;
  readonly now: () => number;
}

export class Governor {
  private turns = 0;
  private failures = 0;
  private nudgeDue = false;
  private readonly startedAt: number;
  stopReason: RunEndReason | null = null;

  constructor(private readonly deps: GovernorDeps) {
    this.startedAt = deps.now();
  }

  readonly afterTurn = (message: AssistantMessage, toolResults: readonly ToolResultMessage[]): boolean => {
    const calls = message.content.filter((part) => part.type === "toolCall").length;
    this.nudgeDue = calls === 0;
    const invalid = toolResults.length > 0 && toolResults.every((result) => result.isError);
    if (message.stopReason === "length") this.fail("reply hit max_tokens");
    else if (calls === 0) this.fail("text-only reply");
    else if (invalid) this.fail(`invalid tool call: ${firstText(toolResults[0])}`);
    else this.failures = 0;
    return this.countTurn();
  };

  modelError(message: AssistantMessage): boolean {
    this.fail(`model error: ${message.errorMessage ?? message.stopReason}`);
    return this.countTurn();
  }

  readonly followUps = (): Promise<AgentMessage[]> => Promise.resolve(this.nudge());

  abort(reason: RunEndReason): void {
    this.stopReason ??= reason;
    this.deps.abort();
  }

  private nudge(): AgentMessage[] {
    if (!this.nudgeDue || this.stopReason !== null) return [];
    this.nudgeDue = false;
    return [{ role: "user", content: NUDGE, timestamp: Date.now() }];
  }

  private fail(reason: string): void {
    this.failures += 1;
    this.deps.retry(reason, this.failures, this.deps.limits.failureLimit);
    if (this.failures >= this.deps.limits.failureLimit) this.stopReason ??= "model_error";
  }

  private countTurn(): boolean {
    this.turns += 1;
    const { maxTurns, maxWallMs } = this.deps.limits;
    if (this.turns >= maxTurns || this.deps.now() - this.startedAt >= maxWallMs) this.stopReason ??= "budget";
    return this.stopReason !== null;
  }
}

function firstText(result: ToolResultMessage | undefined): string {
  const part = result?.content.find((p) => p.type === "text");
  return part?.type === "text" ? part.text : "";
}

export function attachLoopGuard(recorder: Pick<RunRecorder, "subscribe" | "recordLoopGuard">, governor: Governor, policy?: LoopPolicy): LoopDetector {
  const detector = new LoopDetector((notice) => {
    recorder.recordLoopGuard({...notice,evidence:[...notice.evidence]});
    if (notice.phase === "stop") governor.abort("stuck");
  }, policy);
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
  readonly loopDetector?: LoopDetector | undefined;
}

export function piLoop(options: PiLoopOptions): Loop {
  const { systemPrompt, tools, governor, emit, signal, streamFn } = options;
  const config: AgentLoopConfig = {
    ...options.base,
    toolExecution: "sequential",
    transformContext: (messages) => {
      const warning = options.loopDetector?.context();
      const context = slideWindow(messages);
      if (warning) context.push({role:"user",content:warning,timestamp:Date.now()});
      return options.transformContext(context);
    },
    beforeToolCall: async (context, signal) => {
      if (options.loopDetector?.stopped) return {block:true,reason:"Loop guard stopped the run; no further tool execution."};
      return options.base.beforeToolCall?.(context,signal);
    },
    shouldStopAfterTurn: ({ message, toolResults }) => governor.afterTurn(message, toolResults),
    getFollowUpMessages: governor.followUps,
  };
  return {
    start: (prompts, messages) =>
      runAgentLoop(prompts, { systemPrompt, messages, tools }, config, emit, signal, streamFn),
    resume: (messages) => runAgentLoopContinue({ systemPrompt, messages, tools }, config, emit, signal, streamFn),
  };
}

export async function play(task: AgentMessage, governor: Governor, loop: Loop): Promise<RunEndReason> {
  let messages = await loop.start([task], []);
  for (;;) {
    if (governor.stopReason !== null) return governor.stopReason;
    const last = messages.at(-1);
    if (last?.role !== "assistant" || (last.stopReason !== "error" && last.stopReason !== "aborted")) {
      throw new Error("agent loop ended without a stop reason");
    }
    messages = messages.slice(0, -1);
    if (governor.modelError(last)) continue;
    messages = [...messages, ...(await loop.resume([...messages]))];
  }
}
