import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { BUDGET_MARGIN, CHARS_PER_WEIGHT, IMAGE_WEIGHT, overflowTokens } from "./context-budget.js";
import type { FeatureSet } from "./features.js";
import { LOCAL_PROVIDER, VLLM_PROVIDER } from "./local-endpoint.js";

// context-exact-count-v1: count the request body actually sent, on the server that will
// tokenize it, and drop the oldest whole turns until it fits with room for the reply.

export type CountSource = "vllm-tokenize" | "llamacpp-tokenize" | "estimate";

const Message = Type.Object({ role: Type.String({ minLength: 1 }), content: Type.Optional(Type.Unknown()) });
const ChatPayload = Type.Object({
  model: Type.String({ minLength: 1 }),
  messages: Type.Array(Message, { minItems: 1 }),
  tools: Type.Optional(Type.Array(Type.Unknown())),
  chat_template_kwargs: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});
export type ChatPayload = Static<typeof ChatPayload>;
type ChatMessage = Static<typeof Message>;

export interface Counted {
  readonly tokens: number;
  // The server's context size when it reports one with the count (vLLM's max_model_len).
  readonly window: number | null;
}

export interface PayloadCounter {
  readonly source: Exclude<CountSource, "estimate">;
  count(payload: ChatPayload, signal?: AbortSignal): Promise<Counted>;
  // The server's own prompt count for the last request this counter counted.
  calibrate?(serverPrompt: number): void;
}

export class CountError extends Error {
  override readonly name = "CountError";
}

function images(messages: readonly ChatMessage[]): number {
  let n = 0;
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue;
    for (const part of message.content as readonly unknown[]) {
      if (typeof part === "object" && part !== null && "type" in part && part.type === "image_url") n += 1;
    }
  }
  return n;
}

function serverRoot(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

async function post(fetchFn: typeof fetch, url: string, apiKey: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify(body), ...(signal === undefined ? {} : { signal }) });
  } catch (error) {
    throw new CountError(`POST ${url} failed: ${error instanceof Error ? error.name : "error"}`);
  }
  if (!response.ok) throw new CountError(`POST ${url} returned HTTP ${String(response.status)}`);
  try {
    return await response.json();
  } catch {
    throw new CountError(`POST ${url} returned a non-JSON body`);
  }
}

const VllmTokenized = Type.Object({ count: Type.Integer({ minimum: 0 }), max_model_len: Type.Integer({ minimum: 1 }) });

// vLLM's /tokenize applies the same chat template, tool rendering and image processor as /v1/chat/completions.
export function vllmCounter(baseUrl: string, apiKey: string, fetchFn: typeof fetch = fetch): PayloadCounter {
  const url = `${serverRoot(baseUrl)}/tokenize`;
  return {
    source: "vllm-tokenize",
    async count(payload, signal) {
      const body = await post(fetchFn, url, apiKey, { model: payload.model, messages: payload.messages, add_generation_prompt: true, ...(payload.tools === undefined ? {} : { tools: payload.tools }), ...(payload.chat_template_kwargs === undefined ? {} : { chat_template_kwargs: payload.chat_template_kwargs }) }, signal);
      if (!Value.Check(VllmTokenized, body)) throw new CountError(`malformed ${url} response`);
      return { tokens: body.count, window: body.max_model_len };
    },
  };
}

const Templated = Type.Object({ prompt: Type.String() });
const Tokenized = Type.Object({ tokens: Type.Array(Type.Unknown()) });
// llama.cpp's /apply-template leaves one marker per image; /tokenize would count it as text.
const MEDIA_MARKER = /<__media_[A-Za-z0-9_-]*__>/g;

// llama.cpp counts text exactly but has no image-aware tokenize: each image is charged at the
// count measured from the server's prompt_tokens, and at IMAGE_WEIGHT until one is measured.
export function llamaCppCounter(baseUrl: string, apiKey: string, fetchFn: typeof fetch = fetch): PayloadCounter {
  const root = serverRoot(baseUrl);
  let perImage: number | null = null;
  let last: { text: number; images: number } | null = null;
  return {
    source: "llamacpp-tokenize",
    async count(payload, signal) {
      last = null;
      const templated = await post(fetchFn, `${root}/apply-template`, apiKey, { messages: payload.messages, ...(payload.tools === undefined ? {} : { tools: payload.tools }), ...(payload.chat_template_kwargs === undefined ? {} : { chat_template_kwargs: payload.chat_template_kwargs }) }, signal);
      if (!Value.Check(Templated, templated)) throw new CountError(`malformed ${root}/apply-template response`);
      const tokenized = await post(fetchFn, `${root}/tokenize`, apiKey, { content: templated.prompt.replace(MEDIA_MARKER, "") }, signal);
      if (!Value.Check(Tokenized, tokenized)) throw new CountError(`malformed ${root}/tokenize response`);
      const pictures = images(payload.messages);
      last = { text: tokenized.tokens.length, images: pictures };
      return { tokens: tokenized.tokens.length + pictures * (perImage ?? IMAGE_WEIGHT), window: null };
    },
    calibrate(serverPrompt) {
      if (last === null || last.images === 0 || serverPrompt <= last.text) return;
      perImage = Math.ceil((serverPrompt - last.text) / last.images);
    },
  };
}

// The fit drops turns after just-in-time-prompt-v2 has projected its guide onto one of them.
export function exactCountProblems(features: Pick<FeatureSet, "context-exact-count-v1" | "just-in-time-prompt-v2">): string[] {
  return features["context-exact-count-v1"] && features["just-in-time-prompt-v2"] ? ["context-exact-count-v1 requires just-in-time-prompt-v2 OFF (a dropped turn could carry its guidance)"] : [];
}

export function payloadCounter(provider: string, baseUrl: string, apiKey: string | undefined, fetchFn: typeof fetch = fetch): PayloadCounter | null {
  if (apiKey === undefined) return null;
  if (provider === VLLM_PROVIDER) return vllmCounter(baseUrl, apiKey, fetchFn);
  if (provider === LOCAL_PROVIDER) return llamaCppCounter(baseUrl, apiKey, fetchFn);
  return null;
}

// Used only when the server cannot count a request: deliberately high, with no server anchor.
export function estimatePayload(payload: ChatPayload): number {
  let chars = JSON.stringify(payload.tools ?? []).length;
  for (const message of payload.messages) {
    if (typeof message.content === "string") chars += message.content.length;
    else if (Array.isArray(message.content)) {
      for (const part of message.content as readonly unknown[]) {
        if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") chars += part.text.length;
      }
    }
    for (const [key, value] of Object.entries(message)) if (key !== "content" && key !== "role") chars += JSON.stringify(value).length;
  }
  return Math.ceil(chars / CHARS_PER_WEIGHT) + images(payload.messages) * IMAGE_WEIGHT;
}

export interface PromptCount {
  readonly tokens: number;
  readonly source: CountSource;
  readonly limit: number;
  readonly reserve: number;
  readonly dropped_turns: number;
}

export interface ExactHooks {
  compaction(fromTokens: number, toTokens: number): void;
  promptCount(count: PromptCount): void;
}

// Whole turns only: everything before the first assistant reply (system prompt, task) is kept,
// a cut starts at an assistant reply, and the newest turn always stays.
export function dropTurns(messages: readonly ChatMessage[], cut: number): ChatMessage[] {
  const starts = messages.flatMap((message, i) => (message.role === "assistant" ? [i] : []));
  if (cut === 0 || starts.length === 0) return [...messages];
  const from = starts[Math.min(cut, starts.length - 1)] ?? 0;
  return [...messages.slice(0, starts[0]), ...messages.slice(from)];
}

export class ExactContext {
  private reserve = 0;
  private sent: { tokens: number; source: CountSource } | null = null;
  // model-error-recovery-v1: a refused prompt caps every later request at three quarters of itself.
  private ceiling: number | null = null;

  constructor(
    private readonly counter: PayloadCounter,
    private readonly contextWindow: number,
    private readonly maxTokens: number,
    private readonly hooks: ExactHooks,
  ) {}

  capAt(tokens: number): void {
    this.ceiling = this.ceiling === null ? tokens : Math.min(this.ceiling, tokens);
  }

  async fit(payload: unknown, signal?: AbortSignal): Promise<unknown> {
    if (!Value.Check(ChatPayload, payload)) return payload;
    const starts = payload.messages.filter((message) => message.role === "assistant").length;
    let source: CountSource = this.counter.source;
    const measure = async (messages: ChatMessage[]): Promise<Counted> => {
      if (source !== "estimate") {
        try {
          return await this.counter.count({ ...payload, messages }, signal);
        } catch (error) {
          if (!(error instanceof CountError)) throw error;
          source = "estimate";
        }
      }
      return { tokens: estimatePayload({ ...payload, messages }), window: null };
    };
    let cut = 0;
    let messages = [...payload.messages];
    let counted = await measure(messages);
    const first = counted.tokens;
    const limit = (): number =>
      Math.min(
        (counted.window ?? this.contextWindow) - this.maxTokens - (source === "estimate" ? BUDGET_MARGIN : 0) - this.reserve,
        this.ceiling ?? Number.POSITIVE_INFINITY,
      );
    while (counted.tokens > limit() && cut < starts - 1) {
      cut += 1;
      messages = dropTurns(payload.messages, cut);
      counted = await measure(messages);
    }
    this.sent = { tokens: counted.tokens, source };
    this.hooks.promptCount({ tokens: counted.tokens, source, limit: limit(), reserve: this.reserve, dropped_turns: cut });
    if (cut === 0) return payload;
    this.hooks.compaction(first, counted.tokens);
    return { ...payload, messages };
  }

  // The server's own count for the request just sent: any excess over ours is kept back from every later request.
  observe(message: AgentMessage): void {
    if (message.role !== "assistant" || this.sent === null) return;
    const overflow = message.stopReason === "error" ? overflowTokens(message.errorMessage, true) : null;
    const server = overflow ?? message.usage.input + message.usage.cacheRead + message.usage.cacheWrite;
    if (server <= 0) return;
    // Only a request the server counted and we sent can calibrate; a fallback leaves the last count stale.
    if (overflow === null && this.sent.source !== "estimate") this.counter.calibrate?.(server);
    const under = this.sent.source === "estimate" ? 0 : server - this.sent.tokens;
    // An overflow always moves the next fit, so the same request is never resent unchanged.
    const over = overflow === null ? 0 : overflow + this.maxTokens - this.contextWindow;
    this.reserve = Math.max(this.reserve, under, over);
    this.sent = null;
  }
}
