import type { AgentEvent, AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, AssistantMessageEvent, ImageContent, TextContent } from "@mariozechner/pi-ai";
import type { TargetProof } from "./target-stop.js";
import type { LoopNotice } from "./loop-detection.js";
import type { BodyOf, Button, RunEndReason, RunEvent, EventBody } from "./events.js";
import type { FrameRef, FrameStore } from "./frames.js";
import { parseGameState, type GameStateSnapshot, type StateSource } from "./game-state.js";
import { MILESTONE_ORDER, type MilestoneSource, type SeenMilestone } from "./milestones.js";
import type { RunLog } from "./run-log.js";

export class RecorderError extends Error {
  override readonly name = "RecorderError";
}

export type RunStartMeta = Omit<BodyOf<"run_start">, "type" | "turn">;

export interface RecorderDeps {
  readonly log: RunLog;
  readonly frames: FrameStore;
  readonly milestones: MilestoneSource;
  readonly gameState: StateSource;
  readonly now?: () => number;
}

export interface PressTiming {
  readonly hold_frames: number;
  readonly release_frames: number;
}

const CHARS_PER_TOKEN = 4;
const STREAM_FLUSH_MS = 250;
// Any PNG serialized as base64 starts with this; tool text (e.g. the vendor
// /state body) can embed whole frames, which belong in frames/, not the log.
const INLINE_PNG = /iVBORw0KGgo[A-Za-z0-9+/]+={0,2}/g;

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
  private readonly gameState: StateSource;
  private readonly now: () => number;
  private turn = 0;
  private startedAt = 0;
  elapsedMs():number {return this.now()-this.startedAt;}
  private requestAt = 0;
  private firstTokenAt: number | null = null;
  private stream = { thinking: "", text: "", flushedAt: 0 };
  private readonly toolStarts = new Map<string, number>();
  private furthest: string | null = null;
  private storyRequired = false;
  private targetProof:TargetProof|null=null;
  setTargetProof(proof:TargetProof):void {this.targetProof={...proof,state_evidence:[...proof.state_evidence]};}
  private tokens = { input: 0, output: 0 };
  private saved = { saved: 0, bytes: 0 };

  constructor(deps: RecorderDeps) {
    this.log = deps.log;
    this.frames = deps.frames;
    this.milestones = deps.milestones;
    this.gameState = deps.gameState;
    this.now = deps.now ?? (() => performance.now());
  }

  private readonly observers: ((event: RunEvent) => void)[] = [];
  subscribe(observer: (event: RunEvent) => void): void { this.observers.push(observer); }
  private append(body: EventBody): RunEvent {
    const event = this.log.append(body);
    for (const observer of this.observers) observer(event);
    return event;
  }
  recordLoopGuard(body: LoopNotice): void { this.append({type:"loop_guard",turn:this.turn,...body,evidence:[...body.evidence]}); }
  recordObjective(body: BodyOf<"objective_update"> | BodyOf<"objective_attempt">): void { this.append({ ...body, turn: this.turn }); }
  recordState(state: GameStateSnapshot): Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }> {
    if (this.storyRequired && state.story === undefined) throw new RecorderError("Declared story-state-v1 but the game server returned no story state; check the Python reader deployment.");
    const event = this.append({ type: "state", turn: this.turn, ...state }) as Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }>;
    if (this.milestones.observe !== undefined) this.recordMilestones(this.milestones.observe(state, event.seq));
    return event;
  }

  async start(meta: RunStartMeta): Promise<void> {
    this.startedAt = this.now();
    this.storyRequired = meta.harness_features.includes("story-state-v1");
    this.append({ type: "run_start", turn: 0, ...meta });
    this.milestones.initialize?.(meta.start_state.kind);
    await this.checkMilestones();
    this.frames.attach(this.log);
  }

  readonly transformContext = (messages: AgentMessage[]): Promise<AgentMessage[]> => {
    this.turn += 1;
    this.requestAt = this.now();
    this.firstTokenAt = null;
    this.stream = { thinking: "", text: "", flushedAt: this.requestAt };
    this.append({ type: "turn_start", turn: this.turn, context: contextSize(messages) });
    return Promise.resolve(messages);
  };

  readonly emit = async (event: AgentEvent): Promise<void> => {
    await Promise.resolve();
    switch (event.type) {
      case "message_update":
        this.firstTokenAt ??= this.now();
        this.streamDelta(event.assistantMessageEvent);
        break;
      case "message_end":
        if (event.message.role === "assistant") {
          this.flushStream();
          this.recordAssistant(event.message);
        }
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

  private streamDelta(update: AssistantMessageEvent): void {
    if (update.type === "thinking_delta") this.stream.thinking += update.delta;
    else if (update.type === "text_delta") this.stream.text += update.delta;
    else return;
    if (this.now() - this.stream.flushedAt >= STREAM_FLUSH_MS) this.flushStream();
  }

  private flushStream(): void {
    const { thinking, text } = this.stream;
    this.stream = { thinking: "", text: "", flushedAt: this.now() };
    if (thinking === "" && text === "") return;
    this.append({ type: "assistant_delta", turn: this.turn, thinking, text });
  }

  private recordAssistant(message: AssistantMessage): void {
    const done = this.now();
    const thinking = message.content.flatMap((block) => (block.type === "thinking" ? [block.thinking] : [])).join("\n");
    const text = message.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    const tool_calls = message.content.flatMap((block) =>
      block.type === "toolCall" ? [{ id: block.id, name: block.name, args: block.arguments }] : [],
    );
    this.tokens = { input: this.tokens.input + message.usage.input, output: this.tokens.output + message.usage.output };
    this.append({
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
    this.append({ type: "tool_call", turn: this.turn, id, name, args });
  }

  private recordToolResult(id: string, name: string, result: unknown, isError: boolean): void {
    const startedAt = this.toolStarts.get(id);
    if (startedAt === undefined) throw new RecorderError(`tool result for ${id} without a recorded call`);
    this.toolStarts.delete(id);
    const payload = toolResultPayload(result);
    // Reuse the state paired with the exact returned frame/text, including an
    // observe-only turn and play runs with objective tracking disabled.
    if ((name === "observe" || name === "press") && isRecord(result) && isRecord(result.details) && result.details.state !== undefined) {
      try { this.recordState(parseGameState(result.details.state)); }
      catch (error) { this.telemetryError("state", error); }
    }
    const seq = this.log.nextSeq;
    const frames: FrameRef[] = [];
    for (const part of payload.content) {
      if (part.type !== "image") continue;
      const ref = this.frames.save(this.log, seq, frames.length, part.data);
      frames.push(ref);
      this.saved = { saved: this.saved.saved + 1, bytes: this.saved.bytes + Buffer.from(part.data, "base64").length };
    }
    const rawText = payload.content.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("\n");
    const text = rawText.replace(INLINE_PNG, (data) => {
      const ref = this.frames.save(this.log, seq, frames.length, data);
      frames.push(ref);
      this.saved = { saved: this.saved.saved + 1, bytes: this.saved.bytes + Buffer.from(data, "base64").length };
      return `<frame ${ref.path}>`;
    });
    this.append({
      type: "tool_result",
      turn: this.turn,
      id,
      name,
      is_error: isError,
      duration_ms: Math.round(this.now() - startedAt),
      text,
      frames,
    });
    this.frames.flush(this.log, this.turn);
  }

  buttonPress(toolCallId: string, buttons: readonly Button[], timing: PressTiming, before?: GameStateSnapshot): void {
    const beforeSeq=before===undefined?undefined:this.recordState(before).seq;
    this.append({
      type: "button_press",
      turn: this.turn,
      tool_call_id: toolCallId,
      ...(beforeSeq===undefined?{}:{before_state_seq:beforeSeq}),
      buttons: [...buttons],
      hold_frames: timing.hold_frames,
      release_frames: timing.release_frames,
    });
  }

  // The press has landed; a failed read here is logged, never a press failure.
  async afterPress(): Promise<void> {
    if (this.milestones.observe !== undefined) {
      try { this.recordState(await this.gameState.read()); }
      catch (error) { this.telemetryError("state", error); }
      return;
    }
    try {
      await this.checkMilestones();
    } catch (error) {
      this.telemetryError("milestones", error);
    }
    try {
      this.append({ type: "state", turn: this.turn, ...(await this.gameState.read()) });
    } catch (error) {
      this.telemetryError("state", error);
    }
  }

  private telemetryError(source: "milestones" | "state", error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.append({ type: "telemetry_error", turn: this.turn, source, message });
  }

  compaction(fromTokens: number, toTokens: number): void {
    this.append({ type: "compaction", turn: this.turn, from_tokens: fromTokens, to_tokens: toTokens });
  }

  async checkMilestones(): Promise<void> {
    if (this.milestones.observe !== undefined) {
      this.recordState(await this.gameState.read());
      return;
    }
    this.recordMilestones(await this.milestones.poll());
  }

  private recordMilestones(milestones: readonly SeenMilestone[]): void {
    for (const milestone of milestones) {
      if (milestone.origin !== "present_at_start" && (this.furthest === null || MILESTONE_ORDER.indexOf(milestone.name) >= MILESTONE_ORDER.indexOf(this.furthest))) this.furthest = milestone.name;
      this.append({ type: "milestone", turn: this.turn, name: milestone.name, server_timestamp: milestone.serverTimestamp,
        ...(milestone.kind === undefined ? {} : {kind:milestone.kind}),
        ...(milestone.origin === undefined ? {} : {origin:milestone.origin}),
        ...(milestone.evidence === undefined ? {} : {evidence:[...milestone.evidence]}),
      });
    }
  }

  retry(reason: string, attempt: number, limit: number): void {
    this.append({ type: "retry", turn: this.turn, reason, attempt, limit });
  }

  end(reason: RunEndReason): void {
    this.append({
      type: "run_end",
      turn: this.turn,
      reason,
      ...(reason==="milestone"&&this.targetProof!==null?{target_proof:{...this.targetProof,state_evidence:[...this.targetProof.state_evidence]}}:{}),
      furthest_milestone: this.furthest,
      turns: this.turn,
      wall_ms: Math.round(this.now() - this.startedAt),
      tokens: this.tokens,
      frames: this.saved,
    });
  }
}
