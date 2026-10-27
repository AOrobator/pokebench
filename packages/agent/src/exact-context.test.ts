import { readFileSync } from "node:fs";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { LEGACY_ALL_ON as ALL_ON } from "../test-support/legacy-features.js";
import { BUDGET_MARGIN, ContextBudget, IMAGE_WEIGHT, budgetLimit, overflowTokens, requestWeight } from "./context-budget.js";
import { CountError, ExactContext, dropTurns, estimatePayload, llamaCppCounter, payloadCounter, vllmCounter, type ChatPayload, type Counted, type PayloadCounter, type PromptCount } from "./exact-context.js";
import { SWITCHABLE_FEATURES, featureInfo, playHarnessFeatures } from "./features.js";
import { GATEWAY_PROVIDER } from "./gateway.js";
import { LOCAL_PROVIDER, VLLM_PROVIDER } from "./local-endpoint.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { contextBudget } from "./play-wiring.js";

const ID = "context-exact-count-v1";
const VLLM_400 = "400 This model's maximum context length is 65536 tokens. However, you requested 4096 output tokens and your prompt contains at least 61441 input tokens, for a total of at least 65537 tokens. Please reduce the length of the input prompt or the number of requested output tokens. (parameter=input_tokens, value=61441)";
const WINDOW = 65_536;
const MAX = 4096;
const PER_IMAGE = 72;

const usage = (prompt = 0) => ({ input: prompt, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: prompt, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });
function reply(prompt = 0, stopReason: AssistantMessage["stopReason"] = "toolUse", errorMessage?: string): AssistantMessage {
  return { role: "assistant", content: [{ type: "toolCall", id: "c", name: "press", arguments: { buttons: ["A"] } }], api: "openai-completions", provider: VLLM_PROVIDER, model: "m", usage: usage(prompt), stopReason, timestamp: 0, ...(errorMessage === undefined ? {} : { errorMessage }) };
}
function agentResult(chars: number, images: number): ToolResultMessage {
  return { role: "toolResult", toolCallId: "c", toolName: "press", content: [{ type: "text", text: "r".repeat(chars) }, ...Array.from({ length: images }, () => ({ type: "image" as const, data: "x", mimeType: "image/png" }))], isError: false, timestamp: 0 };
}

type Wire = ChatPayload["messages"][number];
const image = { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } };
function wireTurn(i: number, chars: number, images: number): Wire[] {
  return [
    { role: "assistant", content: null, tool_calls: [{ id: `c${String(i)}`, type: "function", function: { name: "press", arguments: "{}" } }] } as Wire,
    { role: "tool", tool_call_id: `c${String(i)}`, content: `${String(i)}:`.padEnd(chars, "r") } as Wire,
    ...(images === 0 ? [] : [{ role: "user", content: Array.from({ length: images }, () => image) }]),
  ];
}
function payload(turns: number, chars: number, images = 1): ChatPayload {
  return { model: "qwen", messages: [{ role: "system", content: "rules" }, { role: "user", content: "Play." }, ...Array.from({ length: turns }, (_, i) => wireTurn(i, chars, images)).flat()], tools: [{ type: "function", function: { name: "press" } }], chat_template_kwargs: { enable_thinking: true } };
}
// A server whose tokenizer charges a character a third of a token and each image 72 tokens.
function serverCount(body: ChatPayload): number {
  let chars = 0, images = 0;
  for (const message of body.messages) {
    if (typeof message.content === "string") chars += message.content.length;
    else if (Array.isArray(message.content)) images += message.content.length;
  }
  return Math.ceil(chars / 3) + images * PER_IMAGE;
}
function fakeCounter(offset = 0): PayloadCounter & { calls: number } {
  const counter = { source: "vllm-tokenize" as const, calls: 0, count: (body: ChatPayload): Promise<Counted> => { counter.calls += 1; return Promise.resolve({ tokens: serverCount(body) + offset, window: WINDOW }); } };
  return counter;
}
function hooks(): { compactions: [number, number][]; counts: PromptCount[]; compaction: (a: number, b: number) => void; promptCount: (c: PromptCount) => void } {
  const out = { compactions: [] as [number, number][], counts: [] as PromptCount[], compaction: (a: number, b: number) => { out.compactions.push([a, b]); }, promptCount: (c: PromptCount) => { out.counts.push(c); } };
  return out;
}
function fitted(value: unknown): ChatPayload {
  return value as ChatPayload;
}

describe("context-exact-count-v1 overflow wording", () => {
  it("reads vLLM's prompt size from its context-length 400 only when asked, and llama.cpp's always", () => {
    expect(overflowTokens(VLLM_400, true)).toBe(61441);
    expect(overflowTokens(VLLM_400)).toBeNull();
    expect(overflowTokens("400 request (67511 tokens) exceeds the available context size (65536 tokens)", true)).toBe(67511);
    expect(overflowTokens("500 server busy", true)).toBeNull();
    expect(overflowTokens(undefined, true)).toBeNull();
  });

  it("OFF: the estimator ignores vLLM's wording; ON without a counter it re-anchors on it", () => {
    const messages: AgentMessage[] = [{ role: "user", content: "Play.", timestamp: 0 }, ...Array.from({ length: 20 }, () => [reply(), agentResult(3000, 0)]).flat()];
    const off = new ContextBudget(budgetLimit(WINDOW, MAX));
    off.fit(messages);
    off.observe(reply(0, "error", VLLM_400));
    expect(off.snapshot().anchor).toBeNull();
    const on = new ContextBudget(budgetLimit(WINDOW, MAX), true);
    on.fit(messages);
    on.observe(reply(0, "error", VLLM_400));
    expect(on.snapshot().anchor).toEqual({ weight: requestWeight(messages), tokens: 61441, basis: "overflow" });
  });
});

describe("context-exact-count-v1 the e1f1 miss", () => {
  it("the estimate predicts a fit that the server rejects, because each dropped image is credited 1000 tokens, not 72", () => {
    const task: AgentMessage = { role: "user", content: "Play.", timestamp: 0 };
    const turn = (chars: number): AgentMessage[] => [reply(), agentResult(chars, 1)];
    const truth = (messages: readonly AgentMessage[]): number => {
      let chars = 0, images = 0;
      for (const m of messages) if ("content" in m && Array.isArray(m.content)) for (const p of m.content) { if (p.type === "text") chars += p.text.length; if (p.type === "image") images += 1; if (p.type === "toolCall") chars += JSON.stringify(p.arguments).length + p.name.length; } else if ("content" in m && typeof m.content === "string") chars += m.content.length;
      return Math.ceil(chars / 3) + images * PER_IMAGE;
    };
    const before = [task, ...Array.from({ length: 30 }, () => turn(2700)).flat()];
    const budget = new ContextBudget(budgetLimit(WINDOW, MAX));
    budget.fit(before);
    budget.observe(reply(truth(before)));
    const after = [...before, ...turn(112_500)];
    const { messages, trim } = budget.fit(after);
    expect(trim?.predicted).toBeLessThanOrEqual(budgetLimit(WINDOW, MAX));
    expect(truth(messages) + MAX).toBeGreaterThan(WINDOW);
    expect(truth(messages) - (trim?.predicted ?? 0)).toBe((IMAGE_WEIGHT - PER_IMAGE) * ((trim?.turns ?? 0) - (trim?.kept ?? 0) - 1));
  });

  it("the exact count trims the same shape until the server's own count fits", async () => {
    const recorded = hooks();
    const exact = new ExactContext(fakeCounter(), WINDOW, MAX, recorded);
    const body = { ...payload(11, 45_000), messages: [...payload(11, 45_000).messages, ...wireTurn(11, 117_000, 1)] };
    const sent = fitted(await exact.fit(body));
    expect(serverCount(sent) + MAX).toBeLessThanOrEqual(WINDOW);
    expect(recorded.counts).toEqual([{ tokens: serverCount(sent), source: "vllm-tokenize", limit: WINDOW - MAX, reserve: 0, dropped_turns: recorded.counts[0]?.dropped_turns }]);
    expect(recorded.compactions).toEqual([[serverCount(body), serverCount(sent)]]);
  });
});

describe("context-exact-count-v1 fitting", () => {
  it("passes a request that fits through as the same object, counting it once", async () => {
    const counter = fakeCounter();
    const recorded = hooks();
    const body = payload(3, 300);
    expect(await new ExactContext(counter, WINDOW, MAX, recorded).fit(body)).toBe(body);
    expect(counter.calls).toBe(1);
    expect(recorded.compactions).toEqual([]);
    expect(recorded.counts[0]).toMatchObject({ tokens: serverCount(body), dropped_turns: 0 });
  });

  it("drops whole turns only: system and task first, each cut at an assistant reply, contents untouched", async () => {
    const body = payload(6, 30_000);
    const sent = fitted(await new ExactContext(fakeCounter(), WINDOW, MAX, hooks()).fit(body));
    expect(sent.messages.slice(0, 2)).toEqual(body.messages.slice(0, 2));
    expect(sent.messages[2]?.role).toBe("assistant");
    const tail = body.messages.slice(body.messages.length - (sent.messages.length - 2));
    expect(sent.messages.slice(2)).toEqual(tail);
    for (const m of sent.messages.slice(2)) expect(body.messages).toContain(m);
  });

  it("keeps the newest turn even when it alone is over the context", async () => {
    const body = payload(3, 400_000);
    const recorded = hooks();
    const sent = fitted(await new ExactContext(fakeCounter(), WINDOW, MAX, recorded).fit(body));
    expect(sent.messages).toEqual(dropTurns(body.messages, 2));
    expect(recorded.counts[0]?.dropped_turns).toBe(2);
    expect(dropTurns(body.messages, 9)).toEqual(dropTurns(body.messages, 2));
    expect(dropTurns(body.messages, 0)).toEqual(body.messages);
    expect(dropTurns(payload(0, 1).messages, 1)).toEqual(payload(0, 1).messages);
  });

  it("leaves a body it cannot read untouched and uncounted", async () => {
    const counter = fakeCounter();
    const recorded = hooks();
    const exact = new ExactContext(counter, WINDOW, MAX, recorded);
    expect(await exact.fit("raw")).toBe("raw");
    expect(await exact.fit({ messages: [] })).toEqual({ messages: [] });
    expect(counter.calls).toBe(0);
    expect(recorded.counts).toEqual([]);
  });

  it("falls back to a conservative estimate with the margin when /tokenize is unavailable", async () => {
    const recorded = hooks();
    const down: PayloadCounter = { source: "vllm-tokenize", count: () => Promise.reject(new CountError("POST /tokenize failed")) };
    const body = payload(8, 30_000);
    const sent = fitted(await new ExactContext(down, WINDOW, MAX, recorded).fit(body));
    expect(estimatePayload(sent)).toBeLessThanOrEqual(WINDOW - MAX - BUDGET_MARGIN);
    expect(recorded.counts[0]).toMatchObject({ source: "estimate", limit: WINDOW - MAX - BUDGET_MARGIN });
    const broken: PayloadCounter = { source: "vllm-tokenize", count: () => Promise.reject(new Error("bug")) };
    await expect(new ExactContext(broken, WINDOW, MAX, hooks()).fit(body)).rejects.toThrow("bug");
  });

  it("estimates text, tool calls, tools and images high", () => {
    const body: ChatPayload = { model: "m", messages: [{ role: "user", content: [{ type: "text", text: "abcdef" }, image, 7] }, { role: "assistant", content: "xyz", tool_calls: [{ id: "a" }] } as Wire, { role: "tool" }], tools: [1] };
    expect(estimatePayload(body)).toBe(Math.ceil((3 + 6 + 3 + JSON.stringify([{ id: "a" }]).length) / 3) + IMAGE_WEIGHT);
    expect(estimatePayload({ model: "m", messages: [{ role: "user", content: "abc" }] })).toBe(Math.ceil(5 / 3));
  });
});

describe("context-exact-count-v1 server feedback", () => {
  it("reserves what the server counted above our count, and the retry after an overflow is never the same request", async () => {
    const counter = fakeCounter();
    const recorded = hooks();
    const exact = new ExactContext(counter, WINDOW, MAX, recorded);
    const body = payload(30, 6000);
    const first = fitted(await exact.fit(body));
    const counted = serverCount(first);
    exact.observe(reply(0, "error", VLLM_400.replace(/61441/g, String(WINDOW - MAX + 1))));
    const retry = fitted(await exact.fit(body));
    expect(retry.messages.length).toBeLessThan(first.messages.length);
    expect(recorded.counts[1]?.reserve).toBe(Math.max(1, WINDOW - MAX + 1 - counted));
    exact.observe(reply(serverCount(retry) + 500));
    await exact.fit(body);
    expect(recorded.counts[2]?.reserve).toBe(Math.max(recorded.counts[1]?.reserve ?? 0, 500));
  });

  it("ignores non-assistant messages, replies with no prompt count and replies before any request", async () => {
    const exact = new ExactContext(fakeCounter(), WINDOW, MAX, hooks());
    exact.observe(reply(5000));
    await exact.fit(payload(2, 100));
    exact.observe(agentResult(1, 0));
    exact.observe(reply(0, "error", "500 busy"));
    exact.observe(reply(1));
    const recorded = hooks();
    const fresh = new ExactContext(fakeCounter(), WINDOW, MAX, recorded);
    await fresh.fit(payload(2, 100));
    exact.observe(reply(1));
    expect(recorded.counts[0]?.reserve).toBe(0);
  });

  it("an overflow on an estimated request still reserves the excess", async () => {
    const recorded = hooks();
    const down: PayloadCounter = { source: "vllm-tokenize", count: () => Promise.reject(new CountError("down")) };
    const exact = new ExactContext(down, WINDOW, MAX, recorded);
    await exact.fit(payload(2, 100));
    exact.observe(reply(999_999));
    exact.observe(reply(0, "error", VLLM_400));
    await exact.fit(payload(2, 100));
    expect(recorded.counts[1]?.reserve).toBe(0);
    await exact.fit(payload(2, 100));
    exact.observe(reply(0, "error", VLLM_400));
    await exact.fit(payload(2, 100));
    expect(recorded.counts[3]?.reserve).toBe(1);
  });
});

type Call = { url: string; init: RequestInit };
function fetchOf(responses: readonly unknown[]): { fetch: typeof fetch; calls: Call[] } {
  const queue = [...responses];
  const calls: Call[] = [];
  const fetchFn = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = queue.shift();
    if (next instanceof Error) return Promise.reject(next);
    if (next instanceof Response) return Promise.resolve(next);
    return Promise.resolve(new Response(JSON.stringify(next), { status: 200 }));
  }) as unknown as typeof fetch;
  return { fetch: fetchFn, calls };
}
const bodyOf = (call: Call | undefined): unknown => JSON.parse(typeof call?.init.body === "string" ? call.init.body : "null");

describe("context-exact-count-v1 counters", () => {
  it("vLLM: posts the exact chat body to /tokenize with the lane's key and returns its count and context size", async () => {
    const { fetch: fetchFn, calls } = fetchOf([{ count: 61441, max_model_len: WINDOW, tokens: [] }]);
    const body = payload(1, 10);
    expect(await vllmCounter("http://127.0.0.1:18020/v1/", "key", fetchFn).count(body)).toEqual({ tokens: 61441, window: WINDOW });
    expect(calls[0]?.url).toBe("http://127.0.0.1:18020/tokenize");
    expect(calls[0]?.init.headers).toMatchObject({ authorization: "Bearer key" });
    expect(bodyOf(calls[0])).toEqual({ model: "qwen", messages: body.messages, add_generation_prompt: true, tools: body.tools, chat_template_kwargs: body.chat_template_kwargs });
    const bare = fetchOf([{ count: 3, max_model_len: 9 }]);
    await vllmCounter("http://h:1", "k", bare.fetch).count({ model: "m", messages: [{ role: "user", content: "x" }] });
    expect(bodyOf(bare.calls[0])).toEqual({ model: "m", messages: [{ role: "user", content: "x" }], add_generation_prompt: true });
    expect(bare.calls[0]?.url).toBe("http://h:1/tokenize");
  });

  it("vLLM: an unreachable, failing or malformed /tokenize is a CountError", async () => {
    const body = payload(1, 10);
    for (const [response, message] of [[new TypeError("fetch failed"), /failed: TypeError/], [new Response("no", { status: 404 }), /HTTP 404/], [new Response("not json", { status: 200 }), /non-JSON/], [{ count: -1 }, /malformed/]] as const) {
      await expect(vllmCounter("http://h:1/v1", "k", fetchOf([response]).fetch).count(body)).rejects.toThrow(message);
    }
    const signal = new AbortController().signal;
    const seen = fetchOf([{ count: 1, max_model_len: 2 }]);
    await vllmCounter("http://h:1/v1", "k", seen.fetch).count(body, signal);
    expect(seen.calls[0]?.init.signal).toBe(signal);
  });

  it("llama.cpp: counts the templated text without media markers and charges images until it measures them", async () => {
    const { fetch: fetchFn, calls } = fetchOf([{ prompt: "<|im_start|>user\nhi<__media_bZMI__><__media_x-1__><|im_end|>" }, { tokens: [1, 2, 3, 4, 5] }, { prompt: "p" }, { tokens: [1, 2, 3, 4, 5] }, { prompt: "p" }, { tokens: [1] }]);
    const counter = llamaCppCounter("http://127.0.0.1:8140/v1", "key", fetchFn);
    const body = payload(1, 10, 2);
    expect(await counter.count(body)).toEqual({ tokens: 5 + 2 * IMAGE_WEIGHT, window: null });
    expect(calls.map((c) => c.url)).toEqual(["http://127.0.0.1:8140/apply-template", "http://127.0.0.1:8140/tokenize"]);
    expect(bodyOf(calls[0])).toEqual({ messages: body.messages, tools: body.tools, chat_template_kwargs: body.chat_template_kwargs });
    expect(bodyOf(calls[1])).toEqual({ content: "<|im_start|>user\nhi<|im_end|>" });
    counter.calibrate?.(5 + 2 * PER_IMAGE);
    expect(await counter.count(body)).toEqual({ tokens: 5 + 2 * PER_IMAGE, window: null });
    counter.calibrate?.(3);
    expect(await counter.count({ model: "m", messages: [{ role: "user", content: "x" }] })).toEqual({ tokens: 1, window: null });
    expect(bodyOf(calls[4])).toEqual({ messages: [{ role: "user", content: "x" }] });
    counter.calibrate?.(500);
  });

  it("llama.cpp: a late count failure sends an estimate and never calibrates images against an unsent candidate", async () => {
    const recorded = hooks();
    const fetchFn = fetchOf([{ prompt: "p" }, { tokens: Array.from({ length: 70_000 }, () => 1) }, new TypeError("fetch failed"), { prompt: "p" }, { tokens: [1] }]).fetch;
    const counter = llamaCppCounter("http://h:1/v1", "k", fetchFn);
    const exact = new ExactContext(counter, WINDOW, MAX, recorded);
    await exact.fit(payload(4, 10, 3));
    expect(recorded.counts[0]?.source).toBe("estimate");
    exact.observe(reply(70_030));
    expect(await counter.count(payload(1, 10, 2))).toEqual({ tokens: 1 + 2 * IMAGE_WEIGHT, window: null });
  });

  it("llama.cpp: a malformed template or tokenize reply is a CountError, and calibration before a count is ignored", async () => {
    const before = llamaCppCounter("http://h:1", "k", fetchOf([{ prompt: "p" }, { tokens: [1] }]).fetch);
    before.calibrate?.(900);
    expect(await before.count(payload(0, 1, 0))).toEqual({ tokens: 1, window: null });
    await expect(llamaCppCounter("http://h:1", "k", fetchOf([{ nope: 1 }]).fetch).count(payload(0, 1))).rejects.toThrow(/apply-template/);
    await expect(llamaCppCounter("http://h:1", "k", fetchOf([{ prompt: "p" }, { nope: 1 }]).fetch).count(payload(0, 1))).rejects.toThrow(/tokenize response/);
  });

  it("picks the counter by provider, and none for the gateway, LM Studio or a lane without a key", () => {
    expect(payloadCounter(VLLM_PROVIDER, "http://h:1/v1", "k")?.source).toBe("vllm-tokenize");
    expect(payloadCounter(LOCAL_PROVIDER, "http://h:1/v1", "k")?.source).toBe("llamacpp-tokenize");
    expect(payloadCounter(GATEWAY_PROVIDER, "http://h:1/v1", "k")).toBeNull();
    expect(payloadCounter(VLLM_PROVIDER, "http://h:1/v1", undefined)).toBeNull();
  });
});

describe("context-exact-count-v1 wiring and registration", () => {
  it("the production factory: OFF is today's budget; ON with a counter replaces it; ON without one reads vLLM's overflow too", async () => {
    const counter = fakeCounter();
    const recorded = hooks();
    const off = contextBudget({ ...ALL_ON, "context-token-budget-v1": true, [ID]: false }, { contextWindow: WINDOW }, MAX, recorded, counter);
    expect(off.exact).toBeUndefined();
    expect(off.budget).toEqual(new ContextBudget(budgetLimit(WINDOW, MAX)));
    expect(contextBudget({ ...ALL_ON, "context-token-budget-v1": false, [ID]: false }, { contextWindow: WINDOW }, MAX, recorded, counter)).toEqual({});
    const on = contextBudget({ ...ALL_ON, "context-token-budget-v1": true, [ID]: true }, { contextWindow: WINDOW }, MAX, recorded, counter);
    expect(on.budget).toBeUndefined();
    await on.exact?.fit(payload(30, 6000));
    expect(recorded.counts).toHaveLength(1);
    expect(recorded.compactions).toHaveLength(1);
    const silent = contextBudget({ ...ALL_ON, [ID]: true }, { contextWindow: WINDOW }, MAX, { compaction: () => undefined }, counter);
    await silent.exact?.fit(payload(1, 1));
    const fallback = contextBudget({ ...ALL_ON, "context-token-budget-v1": true, [ID]: true }, { contextWindow: WINDOW }, MAX, recorded, null);
    expect(fallback.budget).toEqual(new ContextBudget(budgetLimit(WINDOW, MAX), true));
    expect(contextBudget({ ...ALL_ON, "context-token-budget-v1": false, [ID]: true }, { contextWindow: WINDOW }, MAX, recorded, null)).toEqual({});
  });

  it("is the last registered switch: a default-off guard with no dependency, ON in both arms of the current recipe", () => {
    expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(SWITCHABLE_FEATURES.indexOf("map-observability-v1") + 1);
    expect(playHarnessFeatures({ ...ALL_ON, [ID]: true }, null).at(-1)).toBe(ID);
    expect(playHarnessFeatures({ ...ALL_ON, [ID]: false }, null)).not.toContain(ID);
    expect(featureInfo(ID)).toMatchObject({ group: "guard", needs: null, switchable: true, title: "EXACT CONTEXT COUNT" });
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
    expect(normalizeFeatures({ ...ALL_ON, [ID]: undefined } as unknown as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
    const recipe = JSON.parse(readFileSync(new URL("../../../experiments/feature-configs/current.json", import.meta.url), "utf8")) as { onInBoth: string[]; features: Record<string, boolean> };
    expect(recipe.onInBoth).toContain(ID);
    expect(recipe.features[ID]).toBe(true);
  });
});
