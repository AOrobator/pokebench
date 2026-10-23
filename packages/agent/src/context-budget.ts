import type { AgentMessage } from "@mariozechner/pi-agent-core";

// context-token-budget-v1: before each model call, drop the oldest whole turns
// (assistant reply and its tool results) until the request is predicted to fit
// the served context with room for the reply. Text inside a message is never cut.

// Room left for the server's own template and estimate error.
export const BUDGET_MARGIN = 2048;
// Deliberately high per-unit weights, so growth is never underestimated:
// Qwen tokenizes this harness's text at about 3.1 characters a token.
export const CHARS_PER_WEIGHT = 3;
export const IMAGE_WEIGHT = 1000;

export interface BudgetTrim {
  readonly limit: number;
  readonly from: number;
  readonly predicted: number;
  readonly turns: number;
  readonly kept: number;
  // What the prediction was anchored on: server-reported prompt tokens, an overflow error's request size, or the estimate alone.
  readonly basis: "usage" | "overflow" | "estimate";
}

export function budgetLimit(contextWindow: number, maxTokens: number): number {
  return Math.max(1, contextWindow - maxTokens - BUDGET_MARGIN);
}

const OVERFLOW = /request \((\d+) tokens\) exceeds the available context size/;

export function overflowTokens(message: string | undefined): number | null {
  const match = message === undefined ? null : OVERFLOW.exec(message);
  return match === null ? null : Number(match[1]);
}

function partChars(part: unknown): { chars: number; images: number } {
  if (typeof part !== "object" || part === null || !("type" in part)) return { chars: 0, images: 0 };
  switch (part.type) {
    case "image": return { chars: 0, images: 1 };
    case "text": return { chars: "text" in part && typeof part.text === "string" ? part.text.length : 0, images: 0 };
    case "thinking": return { chars: "thinking" in part && typeof part.thinking === "string" ? part.thinking.length : 0, images: 0 };
    case "toolCall": return { chars: JSON.stringify("arguments" in part ? part.arguments : {}).length + ("name" in part && typeof part.name === "string" ? part.name.length : 0), images: 0 };
    default: return { chars: 0, images: 0 };
  }
}

export function requestWeight(messages: readonly AgentMessage[]): number {
  let chars = 0;
  let images = 0;
  for (const message of messages) {
    if (!("content" in message)) continue;
    const parts: readonly unknown[] = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content;
    for (const part of parts) {
      const counted = partChars(part);
      chars += counted.chars;
      images += counted.images;
    }
  }
  return Math.ceil(chars / CHARS_PER_WEIGHT) + images * IMAGE_WEIGHT;
}

export interface ContextBudgetState{readonly limit:number;readonly sent:number|null;readonly anchor:{readonly weight:number;readonly tokens:number;readonly basis:"usage"|"overflow"}|null}

export class ContextBudget {
  private sent: number | null = null;
  private anchor: { weight: number; tokens: number; basis: "usage" | "overflow" } | null = null;

  constructor(readonly limit: number) {}

  snapshot():ContextBudgetState{return {limit:this.limit,sent:this.sent,anchor:this.anchor===null?null:{...this.anchor}};}
  restore(state:ContextBudgetState):void{
    const positive=(n:number)=>Number.isSafeInteger(n)&&n>=0;
    if(state.limit!==this.limit||state.sent!==null&&!positive(state.sent)||state.anchor!==null&&(!positive(state.anchor.weight)||!positive(state.anchor.tokens)||!["usage","overflow"].includes(state.anchor.basis)))throw new Error("invalid context budget restoration");
    this.sent=state.sent;this.anchor=state.anchor===null?null:{...state.anchor};
  }

  private predict(weight: number): number {
    return this.anchor === null ? weight : this.anchor.tokens + weight - this.anchor.weight;
  }

  fit(messages: AgentMessage[]): { messages: AgentMessage[]; trim: BudgetTrim | null } {
    const [task, ...rest] = messages;
    if (task === undefined) return { messages, trim: null };
    const starts = rest.flatMap((message, i) => (message.role === "assistant" ? [i] : []));
    const from = this.predict(requestWeight(messages));
    let kept = messages;
    let predicted = from;
    let cut = 0;
    while (predicted > this.limit && cut < starts.length - 1) {
      cut += 1;
      kept = [task, ...rest.slice(starts[cut] ?? 0)];
      predicted = this.predict(requestWeight(kept));
    }
    this.sent = requestWeight(kept);
    if (cut === 0) return { messages, trim: null };
    return { messages: kept, trim: { limit: this.limit, from, predicted, turns: starts.length, kept: starts.length - cut, basis: this.anchor?.basis ?? "estimate" } };
  }

  // Called with each finished assistant message, so the next prediction starts from the server's own count.
  observe(message: AgentMessage): void {
    if (message.role !== "assistant" || this.sent === null) return;
    const overflow = message.stopReason === "error" ? overflowTokens(message.errorMessage) : null;
    if (overflow !== null) { this.anchor = { weight: this.sent, tokens: overflow, basis: "overflow" }; return; }
    const prompt = message.usage.input + message.usage.cacheRead + message.usage.cacheWrite;
    if (prompt > 0) this.anchor = { weight: this.sent, tokens: prompt, basis: "usage" };
  }
}
