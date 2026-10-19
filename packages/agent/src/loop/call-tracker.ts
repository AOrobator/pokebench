import type { RunEvent } from "../events.js";
import type { GameStateSnapshot } from "../game-state.js";
import type { CompletedCall, TriggerScriptExecution } from "./types.js";

type ToolCallEvent = Extract<RunEvent, { type: "tool_call" }>;
type ButtonPressEvent = Extract<RunEvent, { type: "button_press" }>;
type ToolResultEvent = Extract<RunEvent, { type: "tool_result" }>;

export interface PendingCall {
  args: Record<string, unknown>;
  requested: Record<string, unknown>;
  start?: GameStateSnapshot | undefined;
  seq: number;
  before?: GameStateSnapshot | undefined;
  beforeSeq?: number | undefined;
  navigation?: boolean;
  pressed?: boolean;
  dialogue?: string[];
  spoken?: string[];
  triggerScript?: TriggerScriptExecution;
  triggerEntrySeen?: boolean;
}

export class CallTracker {
  latest: GameStateSnapshot | undefined;
  latestSeq = -1;
  private readonly calls = new Map<string, PendingCall>();

  state(event: Extract<RunEvent, { type: "state" }>): void {
    this.latestSeq = event.seq;
    this.latest = "started" in event ? event : undefined;
  }

  stateError(): void {
    this.latest = undefined;
  }

  start(event: ToolCallEvent): PendingCall {
    const args = typeof event.args === "object" && event.args !== null && !Array.isArray(event.args)
      ? event.args as Record<string, unknown>
      : {};
    const pending: PendingCall = {
      args,
      requested: args,
      seq: event.seq,
      ...(event.name === "navigate_to" ? {
        navigation: true,
        before: this.latest,
        beforeSeq: this.latestSeq,
      } : {}),
    };
    this.calls.set(event.id, pending);
    return pending;
  }

  button(event: ButtonPressEvent, interactions: boolean): { pending: PendingCall; started: boolean } | undefined {
    const pending = this.calls.get(event.tool_call_id);
    if (pending === undefined || (pending.navigation === true && pending.pressed === true)) return undefined;
    const started = pending.pressed !== true;
    if (started) pending.start = event.before_state_seq === this.latestSeq ? this.latest : undefined;
    pending.pressed = true;
    if (pending.navigation !== true && interactions) pending.args = { ...pending.args, buttons: event.buttons };
    pending.before = event.before_state_seq === this.latestSeq ? this.latest : undefined;
    pending.beforeSeq = event.before_state_seq;
    return { pending, started };
  }

  finish(event: ToolResultEvent): CompletedCall {
    const pending = this.calls.get(event.id);
    this.calls.delete(event.id);
    const name = event.name === "act" && !event.is_error
      ? pending?.args["kind"] === "press" ? "press"
        : pending?.args["kind"] === "wait" ? "observe" : event.name
      : event.name;
    return {
      name,
      args: pending?.args ?? {},
      requested: pending?.requested,
      startState: pending?.navigation === true ? pending.before : pending?.start,
      dialogue: pending?.dialogue,
      spoken: pending?.spoken,
      triggerScript: pending?.triggerScript,
      isError: event.is_error,
      text: event.text,
      seq: event.seq,
      beforeState: pending?.before,
      acted: pending?.pressed === true,
      state: pending !== undefined && this.latestSeq >
        ((name === "press" || name === "navigate_to") ? (pending.beforeSeq ?? Infinity) : pending.seq) &&
        (name === "press" || name === "navigate_to" || name === "observe") ? this.latest : undefined,
    };
  }

  pending(): IterableIterator<PendingCall> {
    return this.calls.values();
  }
}
