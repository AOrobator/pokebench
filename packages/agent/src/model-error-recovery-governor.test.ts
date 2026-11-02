import type { AssistantMessage } from "@mariozechner/pi-ai";
import { describe, expect, it, vi } from "vitest";
import { ContextBudget, requestWeight } from "./context-budget.js";
import { ExactContext, type PayloadCounter } from "./exact-context.js";
import { Governor, play, type Loop } from "./harness.js";

import { SERVER_FEATURES, SWITCHABLE_FEATURES, dependencyProblems, featureInfo, playHarnessFeatures, type FeatureSet } from "./features.js";
import { flagFeatures, normalizeFeatures } from "./play-preset.js";
import { playSystemPrompt, playTools } from "./play-config.js";
import { contextBudget } from "./play-wiring.js";
import { ceilingMakesRunUnsatisfiable, modelErrorHandlers } from "./live.js";
import { ALL_ON } from "./features.js";
import { InputCeiling, LaneReadiness, ModelErrorRecovery, modelsProbe, refusedPromptTokens } from "./model-error-recovery.js";
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
  it("absorbs model errors up to the configured bound, then still ends the run", () => {
    const seen: string[] = [];
    const { g } = governor(true, (message) => seen.push(message.errorMessage ?? ""));
    expect(g.modelError(failed())).toBe(false);
    expect(g.stopReason).toBeNull();
    expect(g.modelError(failed())).toBe(false);
    expect(g.stopReason).toBeNull();
    // failureLimit is 3: the third consecutive model error ends the run, so a dead lane is still
    // recorded as model_error rather than surfacing later as a budget stop.
    expect(g.modelError(failed())).toBe(true);
    expect(g.stopReason).toBe("model_error");
    expect(seen).toHaveLength(3);
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
    // failureLimit high enough that every error here is absorbed: the stop must come from the turn
    // budget, not from the error bound, which is what INV-2 claims.
    const retries: { reason: string; attempt: number; limit: number }[] = [];
    const g = new Governor({
      limits: { maxTurns: 3, maxWallMs: 1_000_000, failureLimit: 10 },
      retry: (reason, attempt, limit) => retries.push({ reason, attempt, limit }),
      abort: () => undefined,
      now: () => 0,
      modelErrorRecovery: true,
    });
    const failing = (): AssistantMessage[] => [failed("HTTP 500")];
    const loop: Loop = { start: () => Promise.resolve(failing()), resume: () => Promise.resolve(failing()) };
    const task = { role: "user" as const, content: "play", timestamp: 0 };
    expect(await play(task, g, loop)).toBe("budget");
    expect(retries.length).toBeGreaterThanOrEqual(3);
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
  it("is a default-off, agent-side guard switch with no dependency, appended after its predecessors", () => {
    expect(featureInfo(ID)).toMatchObject({ group: "guard", needs: null, switchable: true, title: "MODEL ERROR RECOVERY" });
    expect(featureInfo(ID).description).toContain(" Off: ");
    expect(featureInfo(ID).description).toContain("on in both arms of the current recipe");
    expect(SWITCHABLE_FEATURES.indexOf(ID)).toBe(320);
    expect(SERVER_FEATURES).not.toContain(ID);
    expect(playHarnessFeatures(ON, null).at(-2)).toBe(ID);
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

describe("a refusal the ceiling cannot answer", () => {
  const MLX = "This prompt (42430 tokens) does not fit in GPU memory: only ~2046MB is available.";

  it("lowers once, then reports that the ceiling cannot go lower", () => {
    const recovery = new ModelErrorRecovery({ baseUrl: "http://127.0.0.1:8091/v1", record: () => undefined });
    expect(recovery.observe({ errorMessage: "This prompt (42430 tokens) does not fit in GPU memory" })).toBe(false);
    expect(recovery.ceiling.limit).toBe(31822);
    expect(recovery.observe({ errorMessage: MLX.replace("42430", "42000") })).toBe(false);
    expect(recovery.ceiling.limit).toBe(31500);
    expect(recovery.observe({ errorMessage: MLX.replace("42430", "42000") })).toBe(true);
  });

  it("records why the run is ending instead of retrying into the same wall", () => {
    const events: string[] = [];
    const recovery = new ModelErrorRecovery({ baseUrl: "http://127.0.0.1:8091/v1", record: (reason) => events.push(reason) });
    recovery.observe({ errorMessage: "This prompt (42430 tokens) does not fit in GPU memory" });
    recovery.observe({ errorMessage: MLX.replace("42430", "42000") });
    recovery.observe({ errorMessage: MLX.replace("42430", "42000") });
    expect(events.at(-1)).toContain("cannot fit under the input ceiling");
    expect(events.at(-1)).toContain("31500");
  });

  it("ends the run with model_error once the lane refuses twice at the same wall", () => {
    const { g } = governor(true, () => undefined);
    const recovery = new ModelErrorRecovery({ baseUrl: "http://127.0.0.1:8091/v1", record: () => undefined });
    const onModelError = (message: { errorMessage?: string }): void => {
      if (recovery.observe(message)) g.abort("model_error");
    };
    onModelError({ errorMessage: "This prompt (42430 tokens) does not fit in GPU memory" });
    expect(g.stopReason).toBeNull();
    onModelError({ errorMessage: MLX.replace("42430", "41000") });
    expect(g.stopReason).toBeNull();
    onModelError({ errorMessage: MLX.replace("42430", "41000") });
    expect(g.stopReason).toBe("model_error");
  });
});

describe("ModelErrorRecovery against the real fitters", () => {
  const model = { contextWindow: 200_000 };
  const task = { role: "user" as const, content: "task", timestamp: 0 };
  const turns = (n: number): unknown[] =>
    Array.from({ length: n }, (_, i) => [
      { role: "assistant", content: "x".repeat(4000), timestamp: i },
      { role: "user", content: "y".repeat(4000), timestamp: i },
    ]).flat();

  it("applies the ceiling to the next request through the fitter live.ts builds", () => {
    let last: { fits: boolean; limit: number } | null = null;
    const wired = contextBudget(
      { ...ON, "context-token-budget-v1": true, "context-exact-count-v1": false, "model-error-recovery-v1": true },
      model,
      4096,
      { compaction: () => undefined },
      null,
      (report) => {
        last = { fits: report.fits, limit: report.limit };
      },
    );
    const recovery = new ModelErrorRecovery({ baseUrl: "http://lane/v1", record: () => undefined });
    recovery.attach(wired);
    recovery.observe({ errorMessage: "This prompt (42430 tokens) does not fit in GPU memory" });
    const fitted = wired.budget?.fit([task, ...turns(60)] as never[]);
    expect(fitted?.trim?.limit).toBe(31822);
    expect(requestWeight(fitted?.messages ?? [])).toBeLessThanOrEqual(31822);
    expect(last).toEqual({ fits: true, limit: 31822 });
  });

  it("ends the run when even the smallest request cannot fit, instead of resending it", () => {
    const events: string[] = [];
    const recovery = new ModelErrorRecovery({ baseUrl: "http://lane/v1", record: (reason) => events.push(reason) });
    const budget = new ContextBudget(1_000_000, false, (report) => {
      if (!report.fits) recovery.markUnsatisfiable();
    });
    recovery.attach({ budget });
    recovery.observe({ errorMessage: "This prompt (2000 tokens) does not fit in GPU memory" });
    expect(recovery.ceiling.limit).toBe(1500);
    // The newest turn alone outweighs the ceiling, so nothing can be dropped to fit.
    const fitted = budget.fit([task, { role: "assistant", content: "z".repeat(30_000), timestamp: 1 }] as never[]);
    expect(fitted.trim).toBeNull();
    expect(events.at(-1)).toContain("no request fits under the input ceiling 1500");
    expect(recovery.observe({ errorMessage: "This prompt (2000 tokens) does not fit in GPU memory" })).toBe(true);
  });

  it("does not trim before a refusal through the estimate fitter when only recovery is on", () => {
    const wired = contextBudget(
      { ...ON, "context-token-budget-v1": false, "context-exact-count-v1": false, "model-error-recovery-v1": true },
      { contextWindow: 1000 },
      100,
      { compaction: () => undefined },
    );
    expect(wired.budget?.fit([task, { role: "assistant", content: "x".repeat(40_000), timestamp: 1 }] as never[]).trim).toBeNull();
  });
});

describe("the probe and the wait", () => {
  it("probes the lane with its key and a bounded timeout of its own", async () => {
    let seen: RequestInit | undefined;
    const fake = (_url: string | URL | Request, init?: RequestInit) => {
      seen = init;
      return Promise.resolve(new Response(null, { status: 200 }));
    };
    const probe = modelsProbe("http://lane/v1/", fake, "k");
    expect(await probe()).toBe(true);
    expect((seen?.headers as Record<string, string>).authorization).toBe("Bearer k");
    expect(seen?.signal).toBeInstanceOf(AbortSignal);
  });

  it("says so when the lane never comes back, and still lets the request through", async () => {
    const phases: string[] = [];
    const readiness = new LaneReadiness({
      probe: () => Promise.resolve(false),
      sleep: () => Promise.resolve(),
      onWait: (phase) => phases.push(phase),
      attempts: 4,
    });
    expect(await readiness.wait()).toBe(500 + 1000 + 2000 + 4000);
    expect(phases).toEqual(["start", "exhausted"]);
  });
});

describe("the composition live.ts actually uses", () => {
  it("ends the run through the seam when the recovery cannot answer", () => {
    const aborts: string[] = [];
    const recovery = new ModelErrorRecovery({ baseUrl: "http://lane/v1", record: () => undefined });
    const handlers = modelErrorHandlers(recovery, (reason) => aborts.push(reason));
    expect(handlers.modelErrorRecovery).toBe(true);
    handlers.onModelError?.({ errorMessage: "This prompt (42430 tokens) does not fit in GPU memory" });
    expect(aborts).toEqual([]);
    recovery.markUnsatisfiable();
    handlers.onModelError?.({ errorMessage: "This prompt (42430 tokens) does not fit in GPU memory" });
    expect(aborts).toEqual(["model_error"]);
  });

  it("is inert when the switch is off", () => {
    expect(modelErrorHandlers(null, () => undefined)).toEqual({ modelErrorRecovery: false });
  });
});

describe("a fit that cannot succeed decides the run", () => {
  it("ends the run from the flag even when every refusal quotes a different size", () => {
    const recovery = new ModelErrorRecovery({ baseUrl: "http://lane/v1", record: () => undefined });
    recovery.observe({ errorMessage: "This prompt (42430 tokens) does not fit in GPU memory" });
    expect(recovery.ceiling.limit).toBe(31822);
    recovery.markUnsatisfiable();
    // 42000 would lower the ceiling to 31500: a different value, so the same-size predicate cannot fire.
    expect(recovery.observe({ errorMessage: "This prompt (42000 tokens) does not fit in GPU memory" })).toBe(true);
  });

  it("only calls the run unsatisfiable for a fit against a ceiling in force", () => {
    const recovery = new ModelErrorRecovery({ baseUrl: "http://lane/v1", record: () => undefined });
    expect(ceilingMakesRunUnsatisfiable(recovery, { fits: false, limit: 1000, predicted: 40_000 })).toBe(false);
    recovery.observe({ errorMessage: "This prompt (42430 tokens) does not fit in GPU memory" });
    expect(ceilingMakesRunUnsatisfiable(recovery, { fits: true, limit: 31822, predicted: 30_000 })).toBe(false);
    expect(ceilingMakesRunUnsatisfiable(recovery, { fits: false, limit: 1000, predicted: 40_000 })).toBe(false);
    expect(ceilingMakesRunUnsatisfiable(recovery, { fits: false, limit: 31822, predicted: 40_000 })).toBe(true);
    expect(ceilingMakesRunUnsatisfiable(null, { fits: false, limit: 31822, predicted: 40_000 })).toBe(false);
  });

  it("reports an unfittable fit through the exact fitter too", async () => {
    const reports: { fits: boolean; limit: number }[] = [];
    const exact = new ExactContext(
      {
        source: "vllm-tokenize",
        count: () => Promise.resolve({ tokens: 40_000, window: 200_000, source: "vllm-tokenize" as const }),
      },
      200_000,
      4096,
      { compaction: () => undefined, promptCount: () => undefined },
      (report) => reports.push({ fits: report.fits, limit: report.limit }),
    );
    exact.capAt(31822);
    await exact.fit({
      model: "qwen",
      messages: [
        { role: "system", content: "rules" },
        { role: "user", content: "Play." },
        { role: "assistant", content: "x" },
      ],
      tools: [{ type: "function", function: { name: "press" } }],
    });
    expect(reports.at(-1)).toEqual({ fits: false, limit: 31822 });
  });
});
