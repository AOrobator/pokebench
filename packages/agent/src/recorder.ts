import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { BodyOf, Button, RunEndReason } from "./events.js";
import type { FrameRef, FrameStore } from "./frames.js";
import type { MilestoneSource } from "./milestones.js";
import type { RunLog } from "./run-log.js";

export class RecorderError extends Error {
  override readonly name = "RecorderError";
}

export type RunStartMeta = Omit<BodyOf<"run_start">, "type" | "turn">;

export interface RecorderDeps {
  readonly log: RunLog;
  readonly frames: FrameStore;
  readonly milestones: MilestoneSource;
  readonly now?: () => number;
}

const CHARS_PER_TOKEN = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentParts(message: AgentMessage): readonly (TextContent | ImageContent | { type: string })[] {
  if (!("content" in message)) return [];
  const content: unknown = message.content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return Array.isArray(content) ? (content as (TextContent | ImageContent)[]) : [];
}

function textOf(part: { type: string }): string {
  if (part.type === "text" && "text" in part && typeof part.text === "string") return part.text;
  if (part.type === "thinking" && "thinking" in part && typeof part.thinking === "string") return part.thinking;
  return "";
}

function contextSize(messages: readonly AgentMessage[]): { messages: number; images: number; est_tokens: number } {
  let chars = 0;
  let images = 0;
  for (const message of messages) {
    for (const part of contentParts(message)) {
      if (part.type === "image") images += 1;
      chars += textOf(part).length;
    }
  }
  return { messages: messages.length, images, est_tokens: Math.ceil(chars / CHARS_PER_TOKEN) };
}

interface ToolResultPayload {
  readonly content: readonly (TextContent | ImageContent)[];
}

function toolResultPayload(result: unknown): ToolResultPayload {
  if (!isRecord(result) || !Array.isArray(result.content)) {
    throw new RecorderError("tool result has no content list");
  }
  return { content: result.content as (TextContent | ImageContent)[] };
}

export class RunRecorder {
  private readonly log: RunLog;
  private readonly frames: FrameStore;
  private readonly milestones: MilestoneSource;
  private readonly now: () => number;
  private turn = 0;
  private startedAt = 0;
  private requestAt = 0;
  private firstTokenAt: number | null = null;
  private readonly toolStarts = new Map<string, number>();
  private furthest: string | null = null;
  private tokens = { input: 0, output: 0 };
  private saved = { saved: 0, bytes: 0 };

  constructor(deps: RecorderDeps) {
    this.log = deps.log;
    this.frames = deps.frames;
    this.milestones = deps.milestones;
    this.now = deps.now ?? (() => performance.now());
  }

  async start(meta: RunStartMeta): Promise<void> {
    this.startedAt = this.now();
    this.log.append({ type: "run_start", turn: 0, ...meta });
    await this.checkMilestones();
    this.frames.attach(this.log);
  }

  readonly transformContext = (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    this.turn += 1;
    this.requestAt = this.now();
    this.firstTokenAt = null;
    this.log.append({ type: "turn_start", turn: this.turn, context: contextSize(messages) });
    return Promise.resolve(messages);
  };

  readonly emit = async (event: AgentEvent): Promise<void> => {
    await Promise.resolve();
    switch (event.type) {
      case "message_update":
        this.firstTokenAt ??= this.now();
        break;
      case "message_end":
        if (event.message.role === "assistant") this.recordAssistant(event.message);
        break;
      case "tool_execution_start":
        this.recordToolCall(event.toolCallId, event.toolName, event.args);
        break;
      case "tool_execution_end":
        this.recordToolResult(event.toolCallId, event.toolName, event.result, event.isError);
        break;
      default:
        break;
    }
  };

  private recordAssistant(message: AssistantMessage): void {
    const done = this.now();
    const thinking = message.content.flatMap((block) => (block.type === "thinking" ? [block.thinking] : [])).join("\n");
    const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const tool_calls = message.content.flatMap((block) =>
      block.type === "toolCall" ? [{ id: block.id, name: block.name, args: block.arguments }] : [],
    );
    this.tokens = { input: this.tokens.input + message.usage.input, output: this.tokens.output + message.usage.output };
    this.log.append({
      type: "assistant",
      turn: this.turn,
      thinking,
      text,
      tool_calls,
      usage: { input: message.usage.input, output: message.usage.output, cache_read: message.usage.cacheRead },
      latency_ms: Math.round(done - this.requestAt),
      ttft_ms: this.firstTokenAt === null ? null : Math.round(this.firstTokenAt - this.requestAt),
      stop_reason: message.stopReason,
      ...(message.errorMessage === undefined ? {} : { error: message.errorMessage }),
    });
  }

  private recordToolCall(id: string, name: string, args: unknown): void {
    if (!isRecord(args)) throw new RecorderError(`tool ${name} called with non-object arguments`);
    this.toolStarts.set(id, this.now());
    this.log.append({ type: "tool_call", turn: this.turn, id, name, args });
  }

  private recordToolResult(id: string, name: string, result: unknown, isError: boolean): void {
    const startedAt = this.toolStarts.get(id);
    if (startedAt === undefined) throw new RecorderError(`tool result for ${id} without a recorded call`);
    this.toolStarts.delete(id);
    const payload = toolResultPayload(result);
    const seq = this.log.nextSeq;
    const frames: FrameRef[] = [];
    for (const part of payload.content) {
      if (part.type !== "image") continue;
      const ref = this.frames.save(this.log, seq, frames.length, part.data);
      frames.push(ref);
      this.saved = { saved: this.saved.saved + 1, bytes: this.saved.bytes + Buffer.from(part.data, "base64").length };
    }
    const text = payload.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
    this.log.append({
      type: "tool_result",
      turn: this.turn,
      id,
      name,
      is_error: isError,
      duration_ms: Math.round(this.now() - startedAt),
      text,
      frames,
    });
  }

  buttonPress(toolCallId: string, buttons: readonly Button[]): void {
    this.log.append({ type: "button_press", turn: this.turn, tool_call_id: toolCallId, buttons: [...buttons] });
  }

  async checkMilestones(): Promise<void> {
    for (const milestone of await this.milestones.poll()) {
      this.furthest = milestone.name;
      this.log.append({
        type: "milestone",
        turn: this.turn,
        name: milestone.name,
        server_timestamp: milestone.serverTimestamp,
      });
    }
  }

  retry(reason: string, attempt: number, limit: number): void {
    this.log.append({ type: "retry", turn: this.turn, reason, attempt, limit });
  }

  end(reason: RunEndReason): void {
    this.log.append({
      type: "run_end",
      turn: this.turn,
      reason,
      furthest_milestone: this.furthest,
      turns: this.turn,
      wall_ms: Math.round(this.now() - this.startedAt),
      tokens: this.tokens,
      frames: this.saved,
    });
  }
}
