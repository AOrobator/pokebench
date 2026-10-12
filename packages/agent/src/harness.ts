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
import type { RunEndReason } from "./events.js";

export interface Window {
  readonly turns: number;
  readonly images: number;
}

export const WINDOW: Window = { turns: 20, images: 3 };
export const OMITTED_FRAME = "[older screenshot omitted]";
export const NUDGE = "Keep playing: call observe or press. Only tool calls advance the game.";

function withoutImages(message: ToolResultMessage, keep: number): ToolResultMessage {
  let kept = 0;
  const content = [...message.content]
    .reverse()
    .map((part) => {
      if (part.type !== "image") return part;
      kept += 1;
      return kept <= keep ? part : { type: "text" as const, text: OMITTED_FRAME };
    })
    .reverse();
  return { ...message, content };
}

export function slideWindow(messages: AgentMessage[], window: Window = WINDOW): AgentMessage[] {
  const [task, ...rest] = messages;
  if (task === undefined) return messages;
  const starts = rest.flatMap((message, i) => (message.role === "assistant" ? [i] : []));
  const from = starts.length > window.turns ? (starts[starts.length - window.turns] ?? 0) : 0;
  const kept = rest.slice(from);
  let images = 0;
  for (let i = kept.length - 1; i >= 0; i -= 1) {
    const message = kept[i];
    if (message?.role !== "toolResult") continue;
    const count = message.content.filter((part) => part.type === "image").length;
    if (images + count > window.images) kept[i] = withoutImages(message, Math.max(0, window.images - images));
    images += count;
  }
  return [task, ...kept];
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
}

export function piLoop(options: PiLoopOptions): Loop {
  const { systemPrompt, tools, governor, emit, signal, streamFn } = options;
  const config: AgentLoopConfig = {
    ...options.base,
    toolExecution: "sequential",
    transformContext: (messages) => options.transformContext(slideWindow(messages)),
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
