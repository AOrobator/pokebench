import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { ContextBudget, requestWeight } from "./context-budget.js";
import { ExactContext, type PayloadCounter } from "./exact-context.js";
import { Governor, play, type Loop } from "./harness.js";

import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, type FeatureSet } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { playSystemPrompt, playTools } from "./play-config.js";
import { contextBudget } from "./play-wiring.js";
import { ALL_ON } from "./features.js";
import { InputCeiling, LaneReadiness, refusedPromptTokens } from "./model-error-recovery.js";
const ON = { ...ALL_ON, "model-error-recovery-v1": true } as FeatureSet;
const OFF = { ...ALL_ON, "model-error-recovery-v1": false } as FeatureSet;

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const MLX_REFUSAL =
  "This prompt (42430 tokens) does not fit in GPU memory even after freeing the prefix cache: it requires ~2160MB GPU memory but only ~2046MB is available. It was refused before any work started.";

function failed(message = MLX_REFUSAL): AssistantMessage {
  return { role: "assistant", content: [], api: "openai-completions", provider: "local", model: "m", usage, stopReason: "error", errorMessage: message, timestamp: 0 };
}

function governor(modelErrorRecovery: boolean, onModelError?: (message: AssistantMessage) => void) {
  const retries: { reason: string; attempt: number; limit: number }[] = [];
  const g = new Governor({
    limits: { maxTurns: 100, maxWallMs: 1_000_000, failureLimit: 3 },
    retry: (reason, attempt, limit) => retries.push({ reason, attempt, limit }),
    abort: () => undefined,
    now: () => 0,
    ...(modelErrorRecovery ? { modelErrorRecovery: true } : {}),
    ...(onModelError === undefined ? {} : { onModelError }),
  });
  return { g, retries };
}

describe("Governor with model-error-recovery-v1", () => {
  it("keeps the run alive through consecutive model errors", () => {
    const seen: string[] = [];
    const { g } = governor(true, (message) => seen.push(message.errorMessage ?? ""));
    for (let i = 0; i < 5; i += 1) expect(g.modelError(failed())).toBe(false);
    expect(g.stopReason).toBeNull();
    expect(seen).toHaveLength(5);
  });

  it("still ends the run after three model errors when the switch is off", () => {
    const { g } = governor(false);
    g.modelError(failed("HTTP 502"));
    g.modelError(failed("HTTP 502"));
    expect(g.stopReason).toBeNull();
    g.modelError(failed("HTTP 502"));
    expect(g.stopReason).toBe("model_error");
  });

  it("still ends the run when a text-only streak carries no model error", () => {
    const { g } = governor(true);
    const textOnly = (): AssistantMessage =>
      ({ role: "assistant", content: [{ type: "text", text: "no call" }], api: "openai-completions", provider: "local", model: "m", usage, stopReason: "stop", timestamp: 0 });
    g.afterTurn(textOnly(), []);
    g.afterTurn(textOnly(), []);
    g.afterTurn(textOnly(), []);
    expect(g.stopReason).toBe("model_error");
  });

  it("still stops on the turn budget while model errors are being absorbed", async () => {
    const { g } = governor(true);
    const failing = (): AssistantMessage[] => [failed("HTTP 500")];
    const calls: number[] = [];
    const loop: Loop = {
      start: () => Promise.resolve(failing()),
      resume: () => {
        calls.push(calls.length);
        if (calls.length === 4) g.abort("budget");
        return Promise.resolve(failing());
      },
    };
    const task = { role: "user" as const, content: "play", timestamp: 0 };
    expect(await play(task, g, loop)).toBe("budget");
    expect(calls.length).toBe(4);
  });
});

describe("input ceiling in the fitters", () => {
  const turn = (n: number, chars = 3000): { role: "user" | "assistant"; content: string; timestamp: number }[] => [
    { role: "assistant", content: "x".repeat(chars), timestamp: n },
    { role: "user", content: "y".repeat(chars), timestamp: n },
  ];

  it("drops whole turns until the next request fits under the ceiling", () => {
    const budget = new ContextBudget(200_000);
    const task = { role: "user" as const, content: "task", timestamp: 0 };
    const messages = [task, ...Array.from({ length: 40 }, (_, i) => turn(i)).flat()] as never[];
    expect(budget.fit(messages).trim).toBeNull();
    budget.capAt(31822);
    const fitted = budget.fit(messages);
    expect(fitted.trim?.limit).toBe(31822);
    expect(requestWeight(fitted.messages)).toBeLessThanOrEqual(31822);
    expect(requestWeight(fitted.messages)).toBeLessThan(requestWeight(messages));
    expect(fitted.messages[0]).toBe(task);
  });

  it("caps the exact counter's own limit", async () => {
    const counter: PayloadCounter = {
      source: "vllm-tokenize",
      count: (payload) => Promise.resolve({ tokens: payload.messages.length * 4000, window: 200_000 }),
    };
    const hooks = { compaction: vi.fn(), promptCount: vi.fn() };
    const exact = new ExactContext(counter, 200_000, 4096, hooks);
    const payload = { model: "m", messages: [{ role: "user", content: "task" }, ...Array.from({ length: 20 }, () => ({ role: "assistant", content: "a" }))] };
    await exact.fit(payload);
    expect(hooks.compaction).not.toHaveBeenCalled();
    exact.capAt(31822);
    const capped = (await exact.fit(payload)) as { messages: unknown[] };
    expect(capped.messages.length).toBeLessThan(payload.messages.length);
    expect(hooks.promptCount).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 31822 }));
  });
});

describe("a run wired for recovery", () => {
  it("lowers the ceiling from the refusal and records it, then waits for the lane", async () => {
    const ceiling = new InputCeiling();
    const recorded: string[] = [];
    const waits: string[] = [];
    const readiness = new LaneReadiness({
      probe: vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true),
      sleep: () => Promise.resolve(),
      onWait: (phase, waitedMs) => waits.push(`${phase}:${String(waitedMs)}`),
    });
    const refused = refusedPromptTokens(MLX_REFUSAL);
    expect(refused).toBe(42430);
    const limit = ceiling.lower(refused ?? 0);
    recorded.push(`prompt refused at ${String(refused)} tokens; input ceiling ${String(limit)}`);
    expect(recorded).toEqual(["prompt refused at 42430 tokens; input ceiling 31822"]);
    expect(await readiness.wait()).toBe(500);
    expect(waits).toEqual(["start:0", "ready:500"]);
  });
});

describe("registry", () => {
  const ID = "model-error-recovery-v1";
  it("is a default-off, agent-side guard switch with no dependency, registered last", () => {
    expect(featureInfo(ID)).toMatchObject({ group: "guard", needs: null, switchable: true, title: "MODEL ERROR RECOVERY" });
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(featureInfo(ID).description).toContain("on in both arms of the current recipe");
    expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(320);
    expect(SERVER_FEATURES).not.toContain(ID);
    expect(playHarnessFeatures(ON, null).at(-1)).toBe(ID);
    expect(playHarnessFeatures(OFF, null)).not.toContain(ID);
    expect(dependencyProblems(ON)).toEqual(dependencyProblems(OFF));
  });

  it("defaults OFF for presets that omit it and for legacy flags; the prompt and tool list never change", () => {
    const without = Object.fromEntries(Object.entries(ON).filter(([id]) => id !== ID)) as Omit<FeatureSet, typeof ID>;
    expect(normalizeFeatures(without)[ID]).toBe(false);
    expect(normalizeFeatures({ ...without, [ID]: true })[ID]).toBe(true);
    expect(flagFeatures({ loopGuard: true, activeUi: true, interfaceDocs: true, objectives: true })[ID]).toBe(false);
    expect(playSystemPrompt(ON, null)).toBe(playSystemPrompt(OFF, null));
    expect(playTools(ON)).toEqual(playTools(OFF));
  });
});

describe("production wiring", () => {
  const model = { contextWindow: 200_000 };
  const recorder = { compaction: () => undefined };
  it("has no fitter to cap when both switches are off", () => {
    expect(contextBudget({ ...OFF, "context-token-budget-v1": false, "model-error-recovery-v1": false }, model, 4096, recorder)).toEqual({});
  });

  it("builds the fitter the ceiling needs when only recovery is on", () => {
    const wired = contextBudget({ ...OFF, "context-token-budget-v1": false, "model-error-recovery-v1": true }, model, 4096, recorder);
    expect(wired.budget).toBeInstanceOf(ContextBudget);
    expect(wired.exact).toBeUndefined();
  });
});
