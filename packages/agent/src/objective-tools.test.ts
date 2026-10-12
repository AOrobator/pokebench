import { createAssistantMessageEventStream, type AssistantMessage, type Message, type Model } from "@mariozechner/pi-ai";
import type { AgentMessage, StreamFn } from "@mariozechner/pi-agent-core";
import { Governor, piLoop } from "./harness.js";
import { expect, it, vi } from "vitest";
import { objectiveGameTools, objectiveTools, objectiveHarness } from "./objective-tools.js";
import { ObjectiveTracker } from "./objectives.js";
import { IN_GAME } from "../test-support/events.js";
import type { BodyOf, RunEvent } from "./events.js";
import type { GameStateSnapshot } from "./game-state.js";

type StateEvent = Extract<Extract<RunEvent, { type: "state" }>, { started: boolean }>;
const envelope = { v: 1 as const, run: "objective_tools", t: "2026-10-12T02:00:00.000-04:00", turn: 1 };
const game = { ...IN_GAME, party: [], field_controls_locked: false };
const request = { title: "Get starter", supports_goal: "Reach gym", evidence: [0], completion: { kind: "state", field: "party_count", value: 1 }, obstacle: "", next_decision: "Interact" };
function setup() {
  let seq = 0;
  const events: RunEvent[] = [];
  const observers: ((event: RunEvent) => void)[] = [];
  const tracker = new ObjectiveTracker("Reach gym", () => undefined);
  const recorder = {
    recordState: (state: GameStateSnapshot): StateEvent => { const e = { ...envelope, seq: seq++, type: "state" as const, ...state }; events.push(e); tracker.observe(e); for (const observer of observers) observer(e); return e; },
    subscribe: (observer: (event: RunEvent) => void) => { observers.push(observer); },
    recordObjective: (body: BodyOf<"objective_update"> | BodyOf<"objective_attempt">) => { const event = { ...envelope, seq: seq++, ...body };events.push(event);for (const observer of observers) observer(event); },
    transformContext: (messages: import("@mariozechner/pi-agent-core").AgentMessage[]) => Promise.resolve(messages),
    buttonPress: () => undefined,
    afterPress: () => Promise.resolve(),
  };
  recorder.recordState(game);
  return { tracker, recorder, events };
}
function serving() {
  let actions = 0;
  const bytes = Buffer.alloc(33); Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).copy(bytes); bytes.write("IHDR",12);bytes.writeUInt32BE(240,16);bytes.writeUInt32BE(160,20);
  const fetchFn: typeof fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let body: unknown;
    if (url.endsWith("/action")) { actions++; body = { status: "success" }; }
    else if (url.endsWith("/queue_status")) body = { queue_empty: true };
    else if (url.endsWith("/pokebench/state")) body = game;
    else body = { state: game, state_text: "Player at (5,8)", screenshot_base64: bytes.toString("base64") };
    return Promise.resolve(new Response(JSON.stringify(body)));
  };
  return { fetchFn, actions: () => actions };
}

it("offers validated objective tools and separates completion from reports", async () => {
  const { tracker } = setup(); const tools = objectiveTools(tracker);
  const get = tools.find((t) => t.name === "get_objectives");
  const set = tools.find((t) => t.name === "set_objective");
  const update = tools.find((t) => t.name === "update_objective");
  if (get === undefined || set === undefined || update === undefined) throw new Error("missing tools");
  expect(JSON.stringify(await get.execute("g", {}))).toContain("Reach gym");
  await expect(set.execute("s", { ...request, evidence: [500] })).rejects.toThrow(/evidence/);
  await expect(set.execute("s", { title: "not enough" })).rejects.toThrow(/parameters/);
  await set.execute("s", request);
  await expect(update.execute("u", {})).rejects.toThrow(/update/);
  await update.execute("u", { status: "blocked", evidence: [0], obstacle: "No response", next_decision: "Observe", retry_reason: "" });
  expect(tracker.snapshot()?.status).toBe("blocked");
});

it("injects coherent observation evidence, records attempts and prevents the third action", async () => {
  const { tracker, recorder, events } = setup(); const server = serving();
  const tools = objectiveGameTools(tracker, recorder, "http://127.0.0.1:8812", server.fetchFn);
  const observe = tools.find((t) => t.name === "observe"); const press = tools.find((t) => t.name === "press");
  if (observe === undefined || press === undefined) throw new Error("missing tools");
  await observe.execute("o", {});
  expect(events.at(-1)).toMatchObject({ type: "state", position: game.position });
  await expect(press.execute("p0", { buttons: ["A"] })).rejects.toThrow(/objective/);
  expect(server.actions()).toBe(0);
  tracker.set({ ...request, completion: { kind: "state", field: "party_count", value: 1 } });
  await expect(press.execute("bad", { buttons: ["INVALID"] })).rejects.toThrow(/parameters/);
  await press.execute("p1", { buttons: ["A"] });
  const second = await press.execute("p2", { buttons: ["A"] });
  expect(JSON.stringify(second)).toContain("reassessment required");
  expect(tracker.attempts).toHaveLength(2);
  await expect(press.execute("p3", { buttons: ["A"] })).rejects.toThrow(/Reassess/);
  expect(server.actions()).toBe(2);
  const controller = new AbortController(); controller.abort();
  await expect(press.execute("abort", { buttons: ["RIGHT"] }, controller.signal)).rejects.toThrow();
  expect(server.actions()).toBe(2);
});

it("refreshes completion evidence and rejects a cached successful condition", async () => {
  const { tracker, recorder } = setup();
  recorder.recordState({ ...game, party: IN_GAME.party });
  tracker.set({ ...request, completion: { kind: "state", field: "party_count", value: 1 } });
  const tools = objectiveTools(tracker, () => Promise.resolve(recorder.recordState(game).seq));
  const update = tools.find((t) => t.name === "update_objective"); if (update === undefined) throw new Error("missing update");
  await expect(update.execute("u", { status: "completed", evidence: [1], obstacle: "", next_decision: "Next", retry_reason: "" })).rejects.toThrow(/Completion/);
  expect(tracker.snapshot()?.status).toBe("active");
});

it("records unavailable outcomes when a submitted press fails", async () => {
  const { tracker, recorder } = setup();tracker.set({ ...request, completion: { kind: "state", field: "party_count", value: 1 } });
  const server = serving();
  const fetchFn: typeof fetch = (input, options) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/action")) return Promise.resolve(new Response("{}", { status: 500 }));
    return server.fetchFn(input, options);
  };
  const press = objectiveGameTools(tracker, recorder, "http://127.0.0.1:8812", fetchFn).find((t) => t.name === "press");
  if (press === undefined) throw new Error("missing press");
  await expect(press.execute("p", { buttons: ["A"] })).rejects.toThrow(/POST/);
  expect(tracker.attempts.at(-1)).toMatchObject({ after_seq: null, outcome: "unavailable", failure_count: 0 });
});


it("composes recorder evidence, game guarding, completion refresh and context in the production owner", async () => {
  const { recorder, events } = setup();const server = serving();
  const harness = objectiveHarness("Reach gym", recorder, "http://127.0.0.1:8812", server.fetchFn);
  expect(harness.tools.map((tool) => tool.name)).toEqual(["observe", "press", "get_objectives", "set_objective", "update_objective"]);
  const [observe, press, get, set, update] = harness.tools;
  if (!observe || !press || !get || !set || !update) throw new Error("missing composition");
  await observe.execute("o", {});const state = events.at(-1);if (!state) throw new Error("missing observed state");
  await set.execute("s", { ...request, evidence: [state.seq] });
  expect(events.at(-1)?.type).toBe("objective_update");
  await press.execute("p1", { buttons: ["A"] });await press.execute("p2", { buttons: ["A"] });
  await expect(press.execute("p3", { buttons: ["A"] })).rejects.toThrow(/Reassess/);
  expect(server.actions()).toBe(2);
  expect(events.filter((event) => event.type === "objective_attempt")).toHaveLength(2);
  const successful = recorder.recordState({ ...game, party: IN_GAME.party });
  await expect(update.execute("u", { status: "completed", evidence: [successful.seq], obstacle: "", next_decision: "Next", retry_reason: "" })).rejects.toThrow(/Completion/);
  const context = await harness.transformContext([]);
  expect(JSON.stringify(context.at(-1))).toContain("HARNESS OBJECTIVE RECORD");
  expect(JSON.stringify(context.at(-1))).toContain("Get starter");
  expect(JSON.stringify(await get.execute("g", {}))).toContain("no_change");
});

it("cancels in-flight pre-press and completion state reads without sending a game action", async () => {
  for (const operation of ["press", "update_objective"]) {
    const { recorder, events } = setup();const requestStarted = Promise.withResolvers<boolean>();const response = Promise.withResolvers<Response>();
    const captured: { signal: AbortSignal | null } = { signal: null };let posts = 0;
    const fetchFn: typeof fetch = (_input, options) => {
      captured.signal = options?.signal ?? null;
      captured.signal?.addEventListener("abort", () => { response.reject(captured.signal?.reason); }, { once: true });
      const url = typeof _input === "string" ? _input : _input instanceof URL ? _input.href : _input.url;
      if (url.endsWith("/action")) posts++;
      requestStarted.resolve(true);return response.promise;
    };
    const harness = objectiveHarness("Reach gym", recorder, "http://127.0.0.1:8812", fetchFn);
    const state = recorder.recordState(game);const set = harness.tools.find((tool) => tool.name === "set_objective");const tool = harness.tools.find((item) => item.name === operation);
    if (!set || !tool) throw new Error("missing operation");
    await set.execute("s", { ...request, evidence: [state.seq] });
    const controller = new AbortController();
    const pending = tool.execute("operation", operation === "press" ? { buttons: ["A"] } : { status: "completed", evidence: [state.seq], obstacle: "", next_decision: "Next", retry_reason: "" }, controller.signal);
    const started = await Promise.race([requestStarted.promise, pending.then(() => false, () => false)]);
    expect(started, `${operation} must reach the live state request`).toBe(true);
    const rejection = expect(pending).rejects.toThrow(/abort/i);
    controller.abort();
    const cancelled = captured.signal?.aborted;
    response.resolve(new Response(JSON.stringify(game)));
    await rejection;
    expect(cancelled, operation).toBe(true);expect(posts, operation).toBe(0);
    expect(events.filter((event) => event.type === "objective_attempt"), operation).toEqual([]);
  }
});


it("supplies the current objective to the pinned model loop after history pruning", async () => {
  const { recorder } = setup();const server = serving();const assembly = objectiveHarness("Reach gym", recorder, "http://127.0.0.1:8812", server.fetchFn);
  const state = recorder.recordState(game);const set = assembly.tools.find((tool) => tool.name === "set_objective");if (!set) throw new Error("missing setter");
  await set.execute("s", { ...request, evidence: [state.seq] });
  const seen: Message[][] = [];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
  const model: Model<"openai-completions"> = { id: "test-lane", name: "test-lane", api: "openai-completions", provider: "test", baseUrl: "http://127.0.0.1:1/v1", reasoning: false, input: ["text"], contextWindow: 1000, maxTokens: 100, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  const response: AssistantMessage = { role: "assistant", content: [{ type: "toolCall", id: "current", name: "get_objectives", arguments: {} }], api: "openai-completions", provider: "test", model: "test-lane", usage, stopReason: "toolUse", timestamp: 0 };
  const messages: AgentMessage[] = [{ role: "user", content: "Play", timestamp: 0 }];
  for (let i = 0; i < 21; i++) {
    messages.push({ ...response, content: [{ type: "text", text: `old-${String(i)}` }, { type: "toolCall", id: `old-${String(i)}`, name: "get_objectives", arguments: {} }] });
    messages.push({ role: "toolResult", toolCallId: `old-${String(i)}`, toolName: "get_objectives", content: [{ type: "text", text: "historical objective" }], isError: false, timestamp: 0 });
  }
  const controller = new AbortController();
  const governor = new Governor({ limits: { maxTurns: 1, maxWallMs: 1000, failureLimit: 3 }, retry: () => undefined, abort: () => { controller.abort(); }, now: () => 0 });
  const streamFn: StreamFn = (_model, context) => { seen.push([...context.messages]);const stream = createAssistantMessageEventStream();stream.push({ type: "done", reason: "toolUse", message: response });return stream; };
  const loop = piLoop({ systemPrompt: "Play", tools: assembly.tools, base: { model, convertToLlm: (messages) => messages as Message[] }, governor, transformContext: assembly.transformContext, emit: () => undefined, signal: controller.signal, streamFn });
  await loop.resume(messages);
  expect(seen).toHaveLength(1);
  expect(JSON.stringify(seen[0])).not.toContain('"text":"old-0"');
  expect(seen[0]?.at(-1)).toMatchObject({ role: "user" });
  expect(JSON.stringify(seen[0]?.at(-1))).toContain("HARNESS OBJECTIVE RECORD");
  expect(JSON.stringify(seen[0]?.at(-1))).toContain("Get starter");
});


it("retains the state-owner timeout while the run remains live", async () => {
  for (const operation of ["press", "update_objective"]) {
    const controller = new AbortController();const deadline = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);
    try {
      const { recorder, events } = setup();const captured: { signal: AbortSignal | null } = { signal: null };
      const fetchFn: typeof fetch = (_input, options) => {
        captured.signal = options?.signal ?? null;
        deadline.abort(new DOMException("state deadline expired", "TimeoutError"));
        if (captured.signal?.aborted) { const reason: unknown = captured.signal.reason;return Promise.reject(reason instanceof Error ? reason : new Error(String(reason))); }
        return Promise.resolve(new Response(JSON.stringify(game)));
      };
      const harness = objectiveHarness("Reach gym", recorder, "http://fixture.invalid", fetchFn);
      const state = recorder.recordState(game);const set = harness.tools.find((tool) => tool.name === "set_objective");const tool = harness.tools.find((item) => item.name === operation);
      if (!set || !tool) throw new Error("missing operation");
      await set.execute("s", { ...request, evidence: [state.seq] });
      await expect(tool.execute("deadline", operation === "press" ? { buttons: ["A"] } : { status: "completed", evidence: [state.seq], obstacle: "", next_decision: "Next", retry_reason: "" }, controller.signal), operation).rejects.toThrow(/deadline/i);
      expect(timeout, operation).toHaveBeenLastCalledWith(15_000);
      expect(controller.signal.aborted, operation).toBe(false);
      expect(captured.signal?.aborted, operation).toBe(true);
      expect(events.filter((event) => event.type === "objective_attempt"), operation).toEqual([]);
    } finally { timeout.mockRestore(); }
  }
});

it("does not commit completion when refresh resolves after cancellation", async () => {
  const { recorder } = setup();const controller = new AbortController();const updates: unknown[] = [];
  const own = new ObjectiveTracker("Reach gym", (body) => { updates.push(body); });
  const before = recorder.recordState(game);own.observe(before);own.set({ ...request, evidence: [before.seq], completion: { kind: "state", field: "party_count", value: 1 } });
  const count = updates.length;
  const tool = objectiveTools(own, () => {
    const fresh = recorder.recordState({ ...game, party: IN_GAME.party });own.observe(fresh);
    controller.abort();return Promise.resolve(fresh.seq);
  }).find((item) => item.name === "update_objective");
  if (!tool) throw new Error("missing update");
  await expect(tool.execute("race", { status: "completed", evidence: [before.seq], obstacle: "", next_decision: "Next", retry_reason: "" }, controller.signal)).rejects.toThrow(/abort/i);
  expect(own.snapshot()?.status).toBe("active");expect(updates).toHaveLength(count);
});


it.each(["state", "visual"] as const)("advertises compatible completion %s strings while enforcing the executor limit", async (kind) => {
  const { tracker } = setup();
  const set = objectiveTools(tracker).find((tool) => tool.name === "set_objective");
  if (set === undefined) throw new Error("missing set_objective");
  const wire = set.parameters;
  expect(wire).toMatchObject({properties: {title: {maxLength: 2000}, completion: {anyOf: [
    {properties: {value: {anyOf: [{type: "string"}, {type: "number"}, {type: "boolean"}]}}},
    {properties: {description: {type: "string", minLength: 1}}}
  ]}}});
  expect(wire).not.toMatchObject({properties: {completion: {anyOf: kind === "state" ? [
    {properties: {value: {anyOf: [{maxLength: 2000}, {}, {}]}}}, {}
  ] : [{}, {properties: {description: {maxLength: 2000}}}]}}});
  const json = JSON.stringify(wire);
  expect(json).toContain("At most 2000 characters");
  const completion = (length: number) => kind === "state" ? {kind, field: "location", value: "x".repeat(length)} : {kind, description: "x".repeat(length)};
  await expect(set.execute("too-long", {...request, completion: completion(2001)})).rejects.toThrow("Invalid objective parameters");
  expect(tracker.snapshot()).toBeNull();
  await set.execute("boundary", {...request, completion: completion(2000)});
  expect(tracker.snapshot()?.completion).toEqual(completion(2000));
});
