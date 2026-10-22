import {withoutFrontierTreatments} from "../test-support/legacy-features.js";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ToolResultMessage } from "@mariozechner/pi-ai";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LEGACY_ALL_ON as ALL_ON } from "../test-support/legacy-features.js";
import { SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures } from "./features.js";
import { experimentArms, parseExperiment } from "./experiments.js";
import { flagFeatures, normalizeFeatures, parsePlayPreset, presetFeatures } from "./play-preset.js";
import { BUDGET_MARGIN, ContextBudget, IMAGE_WEIGHT, budgetLimit, overflowTokens, requestWeight, type BudgetTrim } from "./context-budget.js";

const TASK: AgentMessage = { role: "user", content: "Play.", timestamp: 0 };
const usage = (prompt = 0) => ({ input: prompt, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: prompt, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } });

function assistant(text: string, prompt = 0, stopReason: AssistantMessage["stopReason"] = "toolUse", errorMessage?: string): AssistantMessage {
  return {
    role: "assistant",
    content: [{ type: "thinking", thinking: text }, { type: "toolCall", id: `c${String(text.length)}`, name: "press", arguments: { buttons: ["A"] } }],
    api: "openai-completions", provider: "local", model: "m", usage: usage(prompt), stopReason, timestamp: 0,
    ...(errorMessage === undefined ? {} : { errorMessage }),
  };
}
function result(text: string, images = 0): ToolResultMessage {
  return { role: "toolResult", toolCallId: "c", toolName: "press", content: [{ type: "text", text }, ...Array.from({ length: images }, () => ({ type: "image" as const, data: "x", mimeType: "image/png" }))], isError: false, timestamp: 0 };
}
// n turns, each an assistant reply of `chars` characters and one result of `chars` characters.
function turns(n: number, chars: number): AgentMessage[] {
  return Array.from({ length: n }, (_, i) => [assistant(String(i).padEnd(chars, "t")), result(String(i).padEnd(chars, "r"))]).flat();
}

describe("context-token-budget-v1 budget", () => {
  it("leaves the window to the context size minus the reply and a margin", () => {
    expect(budgetLimit(65536, 4096)).toBe(65536 - 4096 - BUDGET_MARGIN);
    expect(budgetLimit(1000, 4096)).toBe(1);
  });

  it("weighs text conservatively and each image at a fixed cost", () => {
    const one = requestWeight([TASK]);
    expect(requestWeight([TASK, result("", 2)])).toBe(one + 2 * IMAGE_WEIGHT);
    expect(requestWeight([TASK, result("x".repeat(300))])).toBe(one + 100);
    expect(requestWeight([{ role: "user", content: [{ type: "text", text: "abc" }, { type: "image", data: "x", mimeType: "image/png" }], timestamp: 0 }])).toBe(1 + IMAGE_WEIGHT);
  });

  it("passes a request that fits through unchanged and reports nothing", () => {
    const budget = new ContextBudget(100_000);
    const messages = [TASK, ...turns(5, 300)];
    const fitted = budget.fit(messages);
    expect(fitted.messages).toEqual(messages);
    expect(fitted.trim).toBeNull();
  });

  it("drops the oldest whole turns until the estimate fits, keeping the task first", () => {
    const messages = [TASK, ...turns(10, 3000)];
    const limit = requestWeight([TASK, ...turns(4, 3000)]);
    const fitted = new ContextBudget(limit).fit(messages);
    expect(fitted.messages[0]).toBe(TASK);
    expect(fitted.messages.slice(1)).toEqual(messages.slice(1 + 12));
    expect(fitted.messages[1]?.role).toBe("assistant");
    expect(fitted.trim).toEqual<BudgetTrim>({ limit, from: requestWeight(messages), predicted: requestWeight(fitted.messages), turns: 10, kept: 4, basis: "estimate" });
  });

  it("never drops the newest turn, even when it alone is over the budget", () => {
    const messages = [TASK, ...turns(3, 3000)];
    const fitted = new ContextBudget(10).fit(messages);
    expect(fitted.messages).toEqual([TASK, ...messages.slice(5)]);
    expect(fitted.trim?.kept).toBe(1);
  });

  it("does nothing without an assistant turn to cut at", () => {
    const budget = new ContextBudget(1);
    expect(budget.fit([])).toEqual({ messages: [], trim: null });
    expect(budget.fit([TASK, result("x".repeat(9000))]).messages).toHaveLength(2);
  });

  it("calibrates from the prompt tokens the server reported for the last request", () => {
    const messages = [TASK, ...turns(6, 3000)];
    const budget = new ContextBudget(20_000);
    expect(budget.fit(messages).trim).toBeNull();
    const sent = requestWeight(messages);
    budget.observe(assistant("next", 25_000));
    const grown = [...messages, ...turns(1, 3000)];
    const fitted = budget.fit(grown);
    expect(fitted.trim?.basis).toBe("usage");
    expect(fitted.trim?.predicted).toBe(25_000 + requestWeight(fitted.messages) - sent);
    expect(fitted.trim?.predicted).toBeLessThanOrEqual(20_000);
    expect(fitted.messages.length).toBeLessThan(grown.length);
  });

  it("counts cached prompt tokens as prompt tokens", () => {
    const messages = [TASK, ...turns(3, 3000)];
    const budget = new ContextBudget(70_000);
    budget.fit(messages);
    budget.observe({ ...assistant("x"), usage: { ...usage(10), cacheRead: 69_000, cacheWrite: 5 } });
    const fitted = budget.fit([...messages, ...turns(1, 3000)]);
    expect(fitted.trim?.basis).toBe("usage");
    expect(fitted.trim?.predicted).toBe(69_015 + requestWeight(fitted.messages) - requestWeight(messages));
  });

  it("calibrates from a context-size overflow error and fits the retry", () => {
    const messages = [TASK, ...turns(20, 2000)];
    const budget = new ContextBudget(59_392);
    expect(budget.fit(messages).trim).toBeNull();
    budget.observe(assistant("", 0, "error", "400 request (67511 tokens) exceeds the available context size (65536 tokens), try increasing it"));
    const retry = budget.fit(messages);
    expect(retry.trim?.basis).toBe("overflow");
    expect(retry.trim?.predicted).toBeLessThanOrEqual(59_392);
    expect(retry.trim?.predicted).toBe(67_511 + requestWeight(retry.messages) - requestWeight(messages));
  });

  it("ignores replies that report no prompt tokens and errors that are not an overflow", () => {
    const budget = new ContextBudget(1_000_000);
    const messages = [TASK, ...turns(2, 30)];
    budget.fit(messages);
    budget.observe(assistant("x", 0));
    budget.observe(assistant("", 0, "error", "500 server busy"));
    budget.observe(result("not an assistant"));
    expect(new ContextBudget(requestWeight(messages)).fit(messages).trim).toBeNull();
    const tight = new ContextBudget(requestWeight(messages));
    tight.fit(messages);
    tight.observe(assistant("x", 0));
    tight.observe(assistant("", 0, "error", "500 server busy"));
    expect(tight.fit(messages).trim).toBeNull();
  });

  it("reads the request size out of llama.cpp's overflow message", () => {
    expect(overflowTokens("400 request (67511 tokens) exceeds the available context size (65536 tokens), try increasing it")).toBe(67511);
    expect(overflowTokens("400 server busy")).toBeNull();
    expect(overflowTokens(undefined)).toBeNull();
  });

  it("observes before any fit without crashing and keeps estimating", () => {
    const budget = new ContextBudget(1_000_000);
    budget.observe(assistant("x", 50_000));
    expect(budget.fit([TASK]).trim).toBeNull();
  });
});

describe("context-token-budget-v1 registration", () => {
  const ID = "context-token-budget-v1";
  it("is registered just before original-speed-pacing-v1, a default-off guard with no dependency", () => {
    expect(SWITCHABLE_FEATURES.at(-87)).toBe(ID);
    expect(playHarnessFeatures(withoutFrontierTreatments({ ...ALL_ON, "battle-decision-ready-v1": false, [ID]: true }), null).at(-4)).toBe(ID);
    expect(playHarnessFeatures({ ...ALL_ON, "battle-decision-ready-v1": false, [ID]: false }, null)).not.toContain(ID);
    expect(featureInfo(ID)).toMatchObject({ group: "guard", needs: null, switchable: true, title: "CONTEXT TOKEN BUDGET" });
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
    expect(normalizeFeatures({ ...ALL_ON, [ID]: undefined } as unknown as Parameters<typeof normalizeFeatures>[0])[ID]).toBe(false);
  });

  it("has a pending experiment that flips only this switch", () => {
    const raw: unknown = JSON.parse(readFileSync(new URL("../../../experiments/context-token-budget-v1.json", import.meta.url), "utf8"));
    const entry = parseExperiment(raw);
    expect(entry.queuePosition).toBeUndefined();
    expect(entry.changedFeature).toBe(ID);
    const { incumbent, candidate } = experimentArms(entry);
    expect(Object.keys(candidate.features).filter((id) => candidate.features[id as keyof typeof candidate.features] !== incumbent.features[id as keyof typeof incumbent.features])).toEqual([ID]);
    expect(dependencyProblems(presetFeatures(parsePlayPreset(candidate)))).toEqual([]);
  });
});
