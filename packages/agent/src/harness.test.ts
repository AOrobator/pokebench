import {LEGACY_ALL_ON as ALL_ON} from "../test-support/legacy-features.js";
import {gunzipSync} from "node:zlib";
import type { AgentMessage, AgentTool, StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Message,
  type Model,
  type ToolResultMessage,
} from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { appendFileSync, mkdtempSync,readFileSync,rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ControlFile, RunControl, controlLine } from "./run-control.js";
import { PRESS_TIMING, pressTool } from "./game-tools.js";
import { DOUBLE_WINDOW, Governor, NUDGE, OMITTED_FRAME, TEXT_ONLY_NOTE_LIMIT, WINDOW, contextWindow, keepCount, piLoop, play, slideWindow, withoutTextOnlyReplies, attachLoopGuard,type Loop, type Window } from "./harness.js";
import {} from "./features.js";
import { ContextBudget, type BudgetTrim } from "./context-budget.js";

const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function reply(
  calls: string[] = ["press"],
  stopReason: AssistantMessage["stopReason"] = calls.length > 0 ? "toolUse" : "stop",
  errorMessage?: string,
): AssistantMessage {
  return {
    role: "assistant",
    content: [
      { type: "text", text: "thinking aloud" },
      ...calls.map((name, i) => ({ type: "toolCall" as const, id: `c${String(i)}`, name, arguments: {} })),
    ],
    api: "openai-completions",
    provider: "local-gateway",
    model: "think-swarm",
    usage,
    stopReason,
    ...(errorMessage === undefined ? {} : { errorMessage }),
    timestamp: 0,
  };
}

function toolResult(images = 1, isError = false, text = "Location: X"): ToolResultMessage {
  return {
    role: "toolResult",
    toolCallId: "c0",
    toolName: "press",
    content: [
      { type: "text", text },
      ...Array.from({ length: images }, (_, i) => ({ type: "image" as const, data: `img${String(i)}`, mimeType: "image/png" })),
    ],
    isError,
    timestamp: 0,
  };
}

const TASK: AgentMessage = { role: "user", content: "Play.", timestamp: 0 };

describe("keepCount", () => {
  it("keeps everything up to the max, then drops in whole chunks", () => {
    const kept = [1, 6, 7, 8, 9, 10, 12, 13].map((n) => keepCount(n, { max: 6, chunk: 3 }));
    expect(kept).toEqual([1, 6, 4, 5, 6, 4, 6, 4]);
  });
});

function readout(location: string, pressed = "pressed A"): string {
  return `${pressed}\n\n=== PLAYER INFO ===\nPosition: X=3, Y=4\nMoney: $0\n\n=== LOCATION INFO ===\nCurrent Location: ${location}\n${"map row\n".repeat(50)}`;
}

function turnsOf(n: number): AgentMessage[] {
  return Array.from({ length: n }, (_, i) => [reply([`t${String(i)}`]), toolResult(1, false, readout(`TOWN ${String(i)}`))]).flat();
}

function resultTexts(messages: AgentMessage[]): string[] {
  return messages.flatMap((m) => (m.role === "toolResult" ? [m.content.map((p) => (p.type === "text" ? p.text : "<img>")).join(" | ")] : []));
}

describe("withoutTextOnlyReplies", () => {
  it("drops replies without a tool call and keeps everything else, nudges included", () => {
    const nudge: AgentMessage = { role: "user", content: NUDGE, timestamp: 0 };
    const kept = [TASK, reply(), toolResult()];
    const dropped = [reply([]), reply([], "length")];
    expect(withoutTextOnlyReplies([...kept, dropped[0] as AgentMessage, nudge, dropped[1] as AgentMessage, nudge])).toEqual([...kept, nudge, nudge]);
  });

  it("returns the same messages when every reply called a tool", () => {
    const messages = [TASK, ...turnsOf(3)];
    expect(withoutTextOnlyReplies(messages)).toEqual(messages);
  });
});

describe("slideWindow", () => {
  const window: Window = { turns: { max: 20, chunk: 10 }, results: { max: 6, chunk: 3 } };

  it("keeps everything when under both limits", () => {
    const messages = [TASK, ...turnsOf(5)];
    expect(slideWindow(messages, window)).toEqual(messages);
  });

  it("returns an empty context unchanged", () => {
    expect(slideWindow([], window)).toEqual([]);
  });

  it("collapses older tool results to a one-line summary and keeps recent ones whole", () => {
    const out = slideWindow([TASK, ...turnsOf(7)], window);
    const texts = resultTexts(out);
    expect(texts.slice(0, 3)).toEqual([
      `pressed A · TOWN 0 (X=3, Y=4) ${OMITTED_FRAME}`,
      `pressed A · TOWN 1 (X=3, Y=4) ${OMITTED_FRAME}`,
      `pressed A · TOWN 2 (X=3, Y=4) ${OMITTED_FRAME}`,
    ]);
    expect(texts.slice(3).every((text) => text.endsWith(" | <img>") && text.includes("map row"))).toBe(true);
  });

  it("summarizes an observe result and a result without a readout", () => {
    const observed = toolResult(1, false, readout("ROUTE 101", "").trimStart());
    const failed = toolResult(0, true, "POST /action failed: queue full");
    const out = slideWindow([TASK, reply(), observed, reply(), failed, ...turnsOf(6)], window);
    expect(resultTexts(out).slice(0, 2)).toEqual([
      `observed · ROUTE 101 (X=3, Y=4) ${OMITTED_FRAME}`,
      "POST /action failed: queue full",
    ]);
  });

  it("summarizes PokeBench readouts, whose location line is Location:, not only vendor readouts", () => {
    const ours = toolResult(1, false, "pressed A\nPress result: moved (5,9) -> (5,8)\n\nScreen: overworld\nLocation: LITTLEROOT TOWN\nPosition: X=5, Y=8, facing up");
    const out = slideWindow([TASK, reply(), ours, ...turnsOf(6)], window);
    expect(resultTexts(out)[0]).toBe(`pressed A · LITTLEROOT TOWN (X=5, Y=8, facing up) ${OMITTED_FRAME}`);
  });

  it("keeps a collapsed navigate_to result's status line", () => {
    const nav = toolResult(1, false, "Navigation: arrived at requested coordinate; 3 ordinary button attempts.\nScreen: overworld\nLocation: LITTLEROOT TOWN\nPosition: X=5, Y=8, facing up");
    const out = slideWindow([TASK, reply(), nav, ...turnsOf(6)], window);
    expect(resultTexts(out)[0]).toBe(`Navigation: arrived at requested coordinate; 3 ordinary button attempts. · LITTLEROOT TOWN (X=5, Y=8, facing up) ${OMITTED_FRAME}`);
  });

  it("leaves the start of the prompt unchanged between chunk boundaries (prompt cache)", () => {
    const at = (n: number) => slideWindow([TASK, ...turnsOf(n)], window);
    for (const n of [7, 8]) {
      const before = at(n);
      const after = at(n + 1);
      expect(after.slice(0, before.length - 2)).toEqual(before.slice(0, before.length - 2));
    }
  });

  it("drops whole old turns in chunks but always keeps the task", () => {
    const sizes = [20, 21, 29, 30, 31].map((n) => slideWindow([TASK, ...turnsOf(n)], window).filter((m) => m.role === "assistant").length);
    expect(sizes).toEqual([20, 11, 19, 20, 11]);
    const out = slideWindow([TASK, ...turnsOf(21)], window);
    expect(out[0]).toBe(TASK);
    expect(out[1]?.role).toBe("assistant");
  });

  it("drops a nudge that precedes the oldest kept turn", () => {
    const nudge: AgentMessage = { role: "user", content: NUDGE, timestamp: 0 };
    const small: Window = { turns: { max: 1, chunk: 1 }, results: { max: 6, chunk: 3 } };
    const messages = [TASK, reply(), toolResult(0), reply([]), nudge, reply(), toolResult(0)];
    expect(slideWindow(messages, small)).toEqual([TASK, reply(), toolResult(0)]);
  });

  it("does not mutate the full transcript", () => {
    const messages = [TASK, ...turnsOf(8)];
    const copy = structuredClone(messages);
    slideWindow(messages, window);
    expect(messages).toEqual(copy);
  });
});

interface Retry {
  reason: string;
  attempt: number;
  limit: number;
}

function governor(limits: Partial<{ maxTurns: number; maxWallMs: number }> = {}, clock = { t: 0 }) {
  const retries: Retry[] = [];
  const aborted: string[] = [];
  const g = new Governor({
    limits: { maxTurns: 300, maxWallMs: 3_600_000, failureLimit: 3, ...limits },
    retry: (reason, attempt, limit) => {
      retries.push({ reason, attempt, limit });
    },
    abort: () => {
      aborted.push("abort");
    },
    now: () => clock.t,
  });
  return { g, retries, aborted, clock };
}

describe("Governor", () => {
  it("lets successful tool turns run and resets the failure streak", () => {
    const { g, retries } = governor();
    expect(g.afterTurn(reply([]), [])).toBe(false);
    expect(g.afterTurn(reply(), [toolResult()])).toBe(false);
    expect(g.afterTurn(reply([]), [])).toBe(false);
    expect(g.afterTurn(reply([]), [])).toBe(false);
    expect(retries.map((r) => r.attempt)).toEqual([1, 1, 2]);
    expect(g.stopReason).toBeNull();
  });

  it("ends model_error after three consecutive failures of any kind", () => {
    const { g, retries } = governor();
    expect(g.afterTurn(reply([]), [])).toBe(false);
    expect(g.afterTurn(reply(), [toolResult(0, true, "Validation failed for tool press")])).toBe(false);
    g.modelError(reply([], "error", "HTTP 502"));
    expect(g.stopReason).toBe("model_error");
    expect(retries).toEqual([
      { reason: "text-only reply", attempt: 1, limit: 3 },
      { reason: "invalid tool call: Validation failed for tool press", attempt: 2, limit: 3 },
      { reason: "model error: HTTP 502", attempt: 3, limit: 3 },
    ]);
  });

  it("counts a reply cut off at max_tokens as a failure", () => {
    const { g, retries } = governor();
    g.afterTurn(reply(["press"], "length"), [toolResult()]);
    expect(retries[0]?.reason).toBe("reply hit max_tokens");
  });

  it("names the stop reason when a model error has no message", () => {
    const { g, retries } = governor();
    g.modelError(reply([], "error"));
    expect(retries[0]?.reason).toBe("model error: error");
  });

  it("does not count a partly failed tool batch as invalid", () => {
    const { g, retries } = governor();
    g.afterTurn(reply(["press", "observe"]), [toolResult(0, true), toolResult()]);
    expect(retries).toEqual([]);
  });

  it("stops on the turn budget", () => {
    const { g } = governor({ maxTurns: 2 });
    expect(g.afterTurn(reply(), [toolResult()])).toBe(false);
    expect(g.afterTurn(reply(), [toolResult()])).toBe(true);
    expect(g.stopReason).toBe("budget");
  });

  it("stops on the wall budget at a turn boundary", () => {
    const { g, clock } = governor({ maxWallMs: 1_000 });
    clock.t = 1_000;
    expect(g.afterTurn(reply(), [toolResult()])).toBe(true);
    expect(g.stopReason).toBe("budget");
  });

  it("counts model errors toward the turn budget", () => {
    const { g } = governor({ maxTurns: 1 });
    g.modelError(reply([], "error", "boom"));
    expect(g.stopReason).toBe("budget");
  });

  it("aborts with the first reason only", () => {
    const { g, aborted } = governor();
    g.abort("operator_abort");
    g.abort("budget");
    expect(g.stopReason).toBe("operator_abort");
    expect(aborted).toEqual(["abort", "abort"]);
  });

  it("nudges once after a text-only reply, and never after a stop", async () => {
    const { g } = governor();
    g.afterTurn(reply([]), []);
    expect(await g.followUps()).toEqual([expect.objectContaining({ role: "user", content: NUDGE })]);
    expect(await g.followUps()).toEqual([]);
    g.afterTurn(reply([]), []);
    g.abort("operator_abort");
    expect(await g.followUps()).toEqual([]);
  });
});

describe("reply failures that do not end the run (limits.replyFailuresEndRun false)", () => {
  function lenient() {
    const retries: Retry[] = [];
    const g = new Governor({
      limits: { maxTurns: 300, maxWallMs: 3_600_000, failureLimit: 3, replyFailuresEndRun: false },
      retry: (reason, attempt, limit) => { retries.push({ reason, attempt, limit }); },
      abort: () => undefined,
      now: () => 0,
    });
    return { g, retries };
  }
  it("keeps playing through any number of text-only, cut-off or invalid replies, restarting the count", () => {
    const { g, retries } = lenient();
    for (let i = 0; i < 4; i++) {
      g.afterTurn(reply([]), []);
      g.afterTurn(reply([], "length"), []);
      g.afterTurn(reply(), [toolResult(0, true, "Validation failed for tool press")]);
    }
    expect(g.stopReason).toBeNull();
    expect(retries.map((r) => r.attempt)).toEqual([1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]);
  });
  it("still ends model_error after three consecutive model errors, even right after reply failures", () => {
    const { g, retries } = lenient();
    g.afterTurn(reply([]), []);
    g.modelError(reply([], "error", "HTTP 502"));
    g.modelError(reply([], "error", "HTTP 502"));
    expect(g.stopReason).toBeNull();
    g.modelError(reply([], "error", "HTTP 502"));
    expect(g.stopReason).toBe("model_error");
    expect(retries.map((r) => r.attempt)).toEqual([1, 2, 3, 3]);
  });
  it("restarts the model-error count once the model answers", () => {
    const { g } = lenient();
    g.modelError(reply([], "error", "HTTP 502"));
    g.modelError(reply([], "error", "HTTP 502"));
    g.afterTurn(reply([]), []);
    g.modelError(reply([], "error", "HTTP 502"));
    g.modelError(reply([], "error", "HTTP 502"));
    expect(g.stopReason).toBeNull();
  });
  it("gives the text-only supervisor notes first, then keeps playing once they run out", async () => {
    const notes: number[] = [];
    const g = new Governor({
      limits: { maxTurns: 300, maxWallMs: 3_600_000, failureLimit: 3, replyFailuresEndRun: false },
      retry: () => undefined,
      abort: () => undefined,
      now: () => 0,
      textOnlySupervisor: (_replies, note) => { notes.push(note); return `SUPERVISOR note ${String(note)}`; },
    });
    for (let i = 0; i < 15; i++) { g.afterTurn(reply([]), []); await g.followUps(); }
    expect(g.stopReason).toBeNull();
    expect(notes).toEqual([1, 2, 3]);
  });
});

describe("text-only supervisor (text-only-supervisor-v1)", () => {
  function supervised() {
    const notes: [number, number][] = [];
    const retries: Retry[] = [];
    const g = new Governor({
      limits: { maxTurns: 300, maxWallMs: 3_600_000, failureLimit: 3 },
      retry: (reason, attempt, limit) => { retries.push({ reason, attempt, limit }); },
      abort: () => undefined,
      now: () => 0,
      textOnlySupervisor: (replies, note) => { notes.push([replies, note]); return `SUPERVISOR note ${String(note)}`; },
    });
    return { g, notes, retries };
  }
  it("sends a supervisor note instead of ending the run at the failure limit, then restarts the count", async () => {
    const { g, notes, retries } = supervised();
    expect(g.afterTurn(reply([]), [])).toBe(false);
    expect(await g.followUps()).toEqual([expect.objectContaining({ role: "user", content: NUDGE })]);
    g.afterTurn(reply([]), []); await g.followUps();
    expect(g.afterTurn(reply([]), [])).toBe(false);
    expect(g.stopReason).toBeNull();
    // The note is built and recorded only when it is delivered.
    expect(notes).toEqual([]);
    expect(await g.followUps()).toEqual([expect.objectContaining({ role: "user", content: "SUPERVISOR note 1" })]);
    expect(notes).toEqual([[3, 1]]);
    expect(await g.followUps()).toEqual([]);
    g.afterTurn(reply([]), []);
    expect(retries.at(-1)).toEqual({ reason: "text-only reply", attempt: 1, limit: 3 });
  });
  it("treats a reply cut off at max_tokens with no tool call like a text-only reply", async () => {
    const { g, notes } = supervised();
    for (let i = 0; i < 3; i++) { g.afterTurn(reply([], "length"), []); await g.followUps(); }
    expect(g.stopReason).toBeNull();
    expect(notes).toEqual([[3, 1]]);
  });
  it("needs the whole streak to be replies with no tool call", async () => {
    const mixed = supervised();
    mixed.g.modelError(reply([], "error", "HTTP 502")); mixed.g.modelError(reply([], "error", "HTTP 502"));
    mixed.g.afterTurn(reply([]), []); await mixed.g.followUps();
    expect(mixed.g.stopReason).toBe("model_error");
    const cut = supervised();
    cut.g.afterTurn(reply([]), []); cut.g.afterTurn(reply(["press"], "length"), [toolResult()]); cut.g.afterTurn(reply([]), []);
    expect(cut.g.stopReason).toBe("model_error");
    expect([...mixed.notes, ...cut.notes]).toEqual([]);
  });
  it("records no note when the run stops before the note is delivered", async () => {
    const { g, notes } = supervised();
    for (let i = 0; i < 3; i++) g.afterTurn(reply([]), []);
    g.abort("operator_abort");
    expect(await g.followUps()).toEqual([]);
    expect(notes).toEqual([]);
  });
  it("ends the run after the bounded number of notes in a row with no tool call between them", async () => {
    const { g, notes } = supervised();
    for (let i = 0; i < 3 * TEXT_ONLY_NOTE_LIMIT; i++) { g.afterTurn(reply([]), []); await g.followUps(); }
    expect(notes.map(([, n]) => n)).toEqual(Array.from({ length: TEXT_ONLY_NOTE_LIMIT }, (_, i) => i + 1));
    expect(g.stopReason).toBeNull();
    for (let i = 0; i < 3; i++) g.afterTurn(reply([]), []);
    expect(g.stopReason).toBe("model_error");
    expect(notes).toHaveLength(TEXT_ONLY_NOTE_LIMIT);
  });
  it("a successful tool call resets the note count", async () => {
    const { g, notes } = supervised();
    for (let r = 0; r < TEXT_ONLY_NOTE_LIMIT + 1; r++) {
      for (let i = 0; i < 3; i++) { g.afterTurn(reply([]), []); await g.followUps(); }
      g.afterTurn(reply(), [toolResult()]);
    }
    expect(g.stopReason).toBeNull();
    expect(notes.map(([, n]) => n)).toEqual(Array.from({ length: TEXT_ONLY_NOTE_LIMIT + 1 }, () => 1));
  });
  it("still ends the run when the limit is reached by invalid tool calls or model errors", () => {
    const invalid = supervised();
    for (let i = 0; i < 3; i++) invalid.g.afterTurn(reply(), [toolResult(0, true, "Validation failed for tool press")]);
    expect(invalid.g.stopReason).toBe("model_error");
    const errored = supervised();
    errored.g.afterTurn(reply([]), []); errored.g.afterTurn(reply([]), []);
    errored.g.modelError(reply([], "error", "HTTP 502"));
    expect(errored.g.stopReason).toBe("model_error");
    expect([...invalid.notes, ...errored.notes]).toEqual([]);
  });
});

function scriptedLoop(script: (() => AgentMessage[])[], calls: string[]): Loop {
  const next = (): AgentMessage[] => {
    const step = script.shift();
    if (step === undefined) throw new Error("script exhausted");
    return step();
  };
  return {
    start: (prompts, messages) => {
      calls.push(`start ${String(messages.length)}`);
      return Promise.resolve([...prompts, ...next()]);
    },
    resume: (messages) => {
      calls.push(`resume ${String(messages.length)} last=${messages.at(-1)?.role ?? "none"}`);
      return Promise.resolve(next());
    },
  };
}

describe("play", () => {
  it("returns the governor's stop reason once the loop exits", async () => {
    const { g } = governor();
    const calls: string[] = [];
    const loop = scriptedLoop(
      [
        () => {
          g.abort("budget");
          return [reply(), toolResult()];
        },
      ],
      calls,
    );
    expect(await play(TASK, g, loop)).toBe("budget");
    expect(calls).toEqual(["start 0"]);
  });

  it("drops an errored reply and resumes from the last good message", async () => {
    const { g, retries } = governor();
    const calls: string[] = [];
    const loop = scriptedLoop(
      [
        () => [reply(), toolResult(), reply([], "error", "HTTP 502")],
        () => [reply([], "error", "HTTP 502")],
        () => {
          g.abort("operator_abort");
          return [reply(), toolResult()];
        },
      ],
      calls,
    );
    expect(await play(TASK, g, loop)).toBe("operator_abort");
    expect(calls).toEqual(["start 0", "resume 3 last=toolResult", "resume 3 last=toolResult"]);
    expect(retries.map((r) => r.attempt)).toEqual([1, 2]);
  });

  it("ends model_error when model errors exhaust the retry limit", async () => {
    const { g } = governor();
    const calls: string[] = [];
    const failing = () => [reply([], "error", "HTTP 500")];
    const loop = scriptedLoop([failing, failing, failing], calls);
    expect(await play(TASK, g, loop)).toBe("model_error");
    expect(calls).toEqual(["start 0", "resume 1 last=user", "resume 1 last=user"]);
  });

  it("returns the abort reason when a request is aborted", async () => {
    const { g } = governor();
    const loop = scriptedLoop(
      [
        () => {
          g.abort("budget");
          return [reply([], "aborted")];
        },
      ],
      [],
    );
    expect(await play(TASK, g, loop)).toBe("budget");
  });

  it("fails loudly if the loop ends without a stop reason", async () => {
    const { g } = governor();
    const loop = scriptedLoop([() => [reply([])]], []);
    await expect(play(TASK, g, loop)).rejects.toThrow(/without a stop reason/);
  });
});

const MODEL: Model<"openai-completions"> = {
  id: "lane",
  name: "lane",
  api: "openai-completions",
  provider: "local-gateway",
  baseUrl: "http://127.0.0.1:1/v1",
  reasoning: false,
  input: ["text", "image"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1000,
  maxTokens: 100,
};

function pressReply(...batches: string[][]): AssistantMessage {
  return {
    ...reply([]),
    content: batches.map((buttons, i) => ({
      type: "toolCall" as const,
      id: `p${String(i)}`,
      name: "press",
      arguments: { buttons },
    })),
    stopReason: "toolUse",
  };
}

function scriptedModel(replies: AssistantMessage[], seen: Message[][]): StreamFn {
  return (_model, context) => {
    seen.push([...context.messages]);
    const message = replies.shift();
    if (message === undefined) throw new Error("model script exhausted");
    const stream = createAssistantMessageEventStream();
    if (message.stopReason === "error" || message.stopReason === "aborted") {
      stream.push({ type: "error", reason: message.stopReason, error: message });
    } else {
      stream.push({ type: "done", reason: message.stopReason, message });
    }
    return stream;
  };
}

const FakePressArgs = Type.Object({ buttons: Type.Array(Type.String()) });

function fakePress(onPress: (buttons: readonly string[]) => void): AgentTool<typeof FakePressArgs> {
  return {
    name: "press",
    label: "Press",
    description: "press",
    parameters: FakePressArgs,
    execute: (_id, params) => {
      onPress(params.buttons);
      return Promise.resolve({ content: [{ type: "text", text: "ok" }], details: undefined });
    },
  };
}

function realLoop(g: Governor, tools: AgentTool<typeof FakePressArgs>[] | AgentTool[], replies: AssistantMessage[], seen: Message[][], signal: AbortSignal) {
  return piLoop({
    systemPrompt: "play",
    tools,
    base: { model: MODEL, convertToLlm: (messages) => messages as Message[] },
    governor: g,
    transformContext: (messages) => Promise.resolve(messages),
    emit: () => undefined,
    signal,
    streamFn: scriptedModel(replies, seen),
  });
}

describe("piLoop on the pinned pi-agent-core loop", () => {
  it("nudges after a text-only reply and keeps playing", async () => {
    const controller = new AbortController();
    const { g, retries } = governor({ maxTurns: 3 });
    const seen: Message[][] = [];
    const presses: string[] = [];
    const loop = realLoop(
      g,
      [fakePress((b) => presses.push(b.join()))],
      [reply([]), pressReply(["A"]), pressReply(["B"])],
      seen,
      controller.signal,
    );
    expect(await play(TASK, g, loop)).toBe("budget");
    expect(presses).toEqual(["A", "B"]);
    expect(seen[1]?.at(-1)).toMatchObject({ role: "user", content: NUDGE });
    expect(retries).toEqual([{ reason: "text-only reply", attempt: 1, limit: 3 }]);
  });

  it("retries without the text-only reply when the context drops it", async () => {
    const controller = new AbortController();
    const { g, retries } = governor({ maxTurns: 3 });
    const seen: Message[][] = [];
    const loop = piLoop({
      systemPrompt: "play",
      tools: [fakePress(() => undefined)],
      base: { model: MODEL, convertToLlm: (messages) => messages as Message[] },
      governor: g,
      transformContext: (messages) => Promise.resolve(withoutTextOnlyReplies(messages)),
      emit: () => undefined,
      signal: controller.signal,
      streamFn: scriptedModel([pressReply(["A"]), reply([]), pressReply(["B"])], seen),
    });
    expect(await play(TASK, g, loop)).toBe("budget");
    expect(retries).toEqual([{ reason: "text-only reply", attempt: 1, limit: 3 }]);
    expect(seen[2]?.at(-1)).toMatchObject({ role: "user", content: NUDGE });
    expect(seen[2]?.at(-2)?.role).toBe("toolResult");
    expect(seen[2]?.filter((m) => m.role === "assistant")).toHaveLength(1);
  });

  it("drops an errored reply, logs a retry and resumes from the last good message", async () => {
    const controller = new AbortController();
    const { g, retries } = governor({ maxTurns: 3 });
    const seen: Message[][] = [];
    const loop = realLoop(
      g,
      [fakePress(() => undefined)],
      [pressReply(["A"]), reply([], "error", "HTTP 502"), pressReply(["B"])],
      seen,
      controller.signal,
    );
    expect(await play(TASK, g, loop)).toBe("budget");
    expect(retries).toEqual([{ reason: "model error: HTTP 502", attempt: 1, limit: 3 }]);
    expect(seen[2]?.at(-1)?.role).toBe("toolResult");
    expect(seen[2]?.some((m) => m.role === "assistant" && m.stopReason === "error")).toBe(false);
  });

  it("ends model_error after three consecutive failures", async () => {
    const controller = new AbortController();
    const { g } = governor();
    const loop = realLoop(
      g,
      [fakePress(() => undefined)],
      [reply([]), reply([], "error", "HTTP 500"), reply([])],
      [],
      controller.signal,
    );
    expect(await play(TASK, g, loop)).toBe("model_error");
  });

  it("presses nothing more once the run is stopped mid-batch", async () => {
    const controller = new AbortController();
    const { g } = governor();
    g.abort = (reason) => {
      g.stopReason ??= reason;
      controller.abort();
    };
    const posts: string[] = [];
    const fetchFn: typeof fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/action")) {
        posts.push(typeof init?.body === "string" ? init.body : "");
        g.abort("budget");
      }
      return Promise.resolve(new Response(JSON.stringify({ status: "success", queue_empty: true })));
    };
    const tool = pressTool(
      "http://127.0.0.1:1",
      { beforePress: () => undefined, afterPress: () => Promise.resolve() },
      fetchFn,
      { sleep: () => Promise.resolve(), now: () => 0 },
    );
    const loop = realLoop(g, [tool], [pressReply(["A"], ["B"])], [], controller.signal);
    expect(await play(TASK, g, loop)).toBe("budget");
    expect(posts).toEqual([JSON.stringify({ buttons: ["A"], ...PRESS_TIMING })]);
  });
});

describe("operator control on the governor and the pinned loop", () => {
  it("ends with operator_stop at the turn end the control releases, and excludes paused time from the wall cap", () => {
    let stop = false; let paused = 0; const clock = { t: 0 };
    const g = new Governor({ limits: { maxTurns: 300, maxWallMs: 10_000, failureLimit: 3 }, retry: () => undefined, abort: () => undefined, now: () => clock.t, takeStop: () => stop, pausedMs: () => paused });
    clock.t = 12_000; paused = 3_000;
    expect(g.afterTurn(reply(), [toolResult()])).toBe(false);
    clock.t = 13_001;
    expect(g.afterTurn(reply(), [toolResult()])).toBe(true);
    expect(g.stopReason).toBe("budget");
    const h = new Governor({ limits: { maxTurns: 300, maxWallMs: 10_000, failureLimit: 3 }, retry: () => undefined, abort: () => undefined, now: () => 0, takeStop: () => stop });
    expect(h.afterTurn(reply(), [toolResult()])).toBe(false);
    stop = true;
    expect(h.afterTurn(reply(), [toolResult()])).toBe(true);
    expect(h.stopReason).toBe("operator_stop");
  });

  function controlled(script: (control: RunControl, presses: string[]) => void, replies: AssistantMessage[]) {
    const controller = new AbortController();
    const seen: Message[][] = []; const presses: string[] = [];
    let control: RunControl | null = null;
    const g = new Governor({ limits: { maxTurns: 10, maxWallMs: 3_600_000, failureLimit: 3 }, retry: () => undefined, abort: () => { controller.abort(); }, now: () => 0, takeStop: () => control?.takeStop() ?? false });
    control = new RunControl({ record: () => undefined, freeze: () => Promise.resolve(), end: (reason) => { g.abort(reason); }, now: () => 0 });
    const live = control;
    const loop = piLoop({
      systemPrompt: "play", tools: [fakePress((b) => { presses.push(b.join()); script(live, presses); })],
      base: { model: MODEL, convertToLlm: (messages) => messages as Message[] }, governor: g,
      transformContext: (messages) => Promise.resolve(messages), emit: () => undefined, signal: controller.signal,
      streamFn: scriptedModel(replies, seen), gate: (signal) => live.gate(signal),
    });
    return { result: play(TASK, g, loop), seen, presses, control: live };
  }
  const at = "2026-10-13T15:00:00.000Z";

  it("holds the next model call while paused and stops after the in-flight turn's presses", async () => {
    const run = controlled((control, presses) => {
      if (presses.length === 1) control.apply({ v: 1, seq: 1, at, action: "pause" });
      if (presses.length === 2) control.apply({ v: 1, seq: 3, at, action: "stop" });
    }, [pressReply(["A"]), pressReply(["B"]), pressReply(["C"])]);
    await vi.waitFor(() => { expect(run.control.state).toBe("paused"); });
    expect(run.seen).toHaveLength(1);
    run.control.apply({ v: 1, seq: 2, at, action: "resume" });
    expect(await run.result).toBe("operator_stop");
    expect(run.presses).toEqual(["A", "B"]);
    expect(run.seen).toHaveLength(2);
  });

  it("ends a paused run without another model request", async () => {
    const run = controlled((control) => { control.apply({ v: 1, seq: 1, at, action: "pause" }); }, [pressReply(["A"]), pressReply(["B"])]);
    await vi.waitFor(() => { expect(run.control.state).toBe("paused"); });
    run.control.apply({ v: 1, seq: 2, at, action: "stop" });
    expect(await run.result).toBe("operator_stop");
    expect(run.seen).toHaveLength(1);
    expect(run.presses).toEqual(["A"]);
  });
});

describe("operator abort while paused on the pinned loop", () => {
  it("ends with the governor's reason when the run is aborted (Ctrl-C) while held at the gate", async () => {
    const controller = new AbortController();
    const seen: Message[][] = [];
    let control: RunControl | null = null;
    const g = new Governor({ limits: { maxTurns: 10, maxWallMs: 3_600_000, failureLimit: 3 }, retry: () => undefined, abort: () => { controller.abort(); }, now: () => 0, takeStop: () => control?.takeStop() ?? false });
    const live = new RunControl({ record: () => undefined, freeze: () => Promise.resolve(), end: (reason) => { g.abort(reason); }, now: () => 0 });
    control = live;
    const loop = piLoop({
      systemPrompt: "play", tools: [fakePress(() => { live.apply({ v: 1, seq: 1, at: "2026-10-13T15:00:00.000Z", action: "pause" }); })],
      base: { model: MODEL, convertToLlm: (messages) => messages as Message[] }, governor: g,
      transformContext: (messages) => Promise.resolve(messages), emit: () => undefined, signal: controller.signal,
      streamFn: scriptedModel([pressReply(["A"]), pressReply(["B"])], seen), gate: (signal) => live.gate(signal),
    });
    const result = play(TASK, g, loop);
    await vi.waitFor(() => { expect(live.holding).toBe(true); });
    g.abort("operator_abort");
    expect(await result).toBe("operator_abort");
    expect(seen).toHaveLength(1);
  });
});

describe("control-file requests at the turn boundary", () => {
  function fileControlled(action: "pause" | "stop") {
    const path = join(mkdtempSync(join(tmpdir(), "control-")), "control.jsonl");
    const file = new ControlFile(path);
    const controller = new AbortController();
    const seen: Message[][] = [];
    let control: RunControl | null = null;
    const g = new Governor({ limits: { maxTurns: 10, maxWallMs: 3_600_000, failureLimit: 3 }, retry: () => undefined, abort: () => { controller.abort(); }, now: () => 0, takeStop: () => control?.takeStop() ?? false });
    const live = new RunControl({ record: () => undefined, freeze: () => Promise.resolve(), end: (reason) => { g.abort(reason); }, now: () => 0, poll: () => file.poll() });
    control = live;
    // The request lands during the first turn's press, before any poll interval fires.
    const loop = piLoop({
      systemPrompt: "play", tools: [fakePress(() => { appendFileSync(path, `${controlLine(1, action, "2026-10-13T15:00:00.000Z")}\n`); })],
      base: { model: MODEL, convertToLlm: (messages) => messages as Message[] }, governor: g,
      transformContext: (messages) => Promise.resolve(messages), emit: () => undefined, signal: controller.signal,
      streamFn: scriptedModel([pressReply(["A"]), pressReply(["B"]), pressReply(["C"])], seen), gate: (signal) => live.gate(signal),
    });
    return { result: play(TASK, g, loop), seen, live, abort: () => { g.abort("operator_abort"); } };
  }

  it("holds before the next model call for a pause appended during the turn", async () => {
    const run = fileControlled("pause");
    await vi.waitFor(() => { expect(run.live.holding).toBe(true); });
    expect(run.seen).toHaveLength(1);
    run.abort();
    expect(await run.result).toBe("operator_abort");
    expect(run.seen).toHaveLength(1);
  });

  it("holds before the very first model call for a pause appended before the run starts", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "control-")), "control.jsonl");
    appendFileSync(path, `${controlLine(1, "pause", "2026-10-13T15:00:00.000Z")}\n`);
    const file = new ControlFile(path);
    const controller = new AbortController();
    const seen: Message[][] = [];
    const g = new Governor({ limits: { maxTurns: 10, maxWallMs: 3_600_000, failureLimit: 3 }, retry: () => undefined, abort: () => { controller.abort(); }, now: () => 0 });
    const live = new RunControl({ record: () => undefined, freeze: () => Promise.resolve(), end: (reason) => { g.abort(reason); }, now: () => 0, poll: () => file.poll() });
    const loop = piLoop({
      systemPrompt: "play", tools: [fakePress(() => undefined)], base: { model: MODEL, convertToLlm: (messages) => messages as Message[] }, governor: g,
      transformContext: (messages) => Promise.resolve(messages), emit: () => undefined, signal: controller.signal,
      streamFn: scriptedModel([pressReply(["A"])], seen), gate: (signal) => live.gate(signal),
    });
    const result = play(TASK, g, loop);
    await vi.waitFor(() => { expect(live.holding).toBe(true); });
    expect(seen).toHaveLength(0);
    g.abort("operator_abort");
    expect(await result).toBe("operator_abort");
    expect(seen).toHaveLength(0);
  });

  it("ends after the turn for a stop appended during the turn", async () => {
    const run = fileControlled("stop");
    expect(await run.result).toBe("operator_stop");
    expect(run.seen).toHaveLength(1);
  });
});

describe("double-context-window-v1", () => {
  const off = { ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": false, "double-context-window-v1": false };
  const on = { ...ALL_ON,"cache-aligned-window-v1":false, "dialogue-context-kept-v1": false, "double-context-window-v1": true };
  const assistants = (window: Window, n: number) => slideWindow([TASK, ...turnsOf(n)], window).filter((m) => m.role === "assistant").length;
  const whole = (window: Window, n: number) => resultTexts(slideWindow([TASK, ...turnsOf(n)], window)).filter((t) => !t.endsWith(OMITTED_FRAME)).length;

  it("OFF is the incumbent window; ON doubles both limits and their chunks", () => {
    expect(WINDOW).toEqual({ turns: { max: 20, chunk: 10 }, results: { max: 6, chunk: 3 } });
    expect(contextWindow(off)).toBe(WINDOW);
    expect(contextWindow(on)).toBe(DOUBLE_WINDOW);
    expect(DOUBLE_WINDOW).toEqual({ turns: { max: 40, chunk: 20 }, results: { max: 12, chunk: 6 } });
  });

  it("ON keeps twice the turns and full results that OFF keeps", () => {
    expect([40, 41, 60, 61].map((n) => assistants(WINDOW, n))).toEqual([20, 11, 20, 11]);
    expect([40, 41, 60, 61].map((n) => assistants(DOUBLE_WINDOW, n))).toEqual([40, 21, 40, 21]);
    expect([6, 12, 13].map((n) => whole(WINDOW, n))).toEqual([6, 6, 4]);
    expect([6, 12, 13].map((n) => whole(DOUBLE_WINDOW, n))).toEqual([6, 12, 7]);
  });

  it("piLoop slides the window it is given, and the incumbent one by default", async () => {
    const run = async (window: Window | undefined) => {
      const controller = new AbortController();
      const { g } = governor({ maxTurns: 4 });
      const seen: Message[][] = [];
      const loop = piLoop({
        systemPrompt: "play",
        tools: [fakePress(() => undefined)],
        base: { model: MODEL, convertToLlm: (messages) => messages as Message[] },
        governor: g,
        transformContext: (messages) => Promise.resolve(messages),
        emit: () => undefined,
        signal: controller.signal,
        streamFn: scriptedModel([pressReply(["A"]), pressReply(["A"]), pressReply(["A"]), pressReply(["A"])], seen),
        ...(window === undefined ? {} : { window }),
      });
      await play(TASK, g, loop);
      return seen.at(-1)?.filter((m) => m.role === "assistant").length;
    };
    expect(await run({ turns: { max: 1, chunk: 1 }, results: { max: 6, chunk: 3 } })).toBe(1);
    expect(await run(undefined)).toBe(3);
  });
});

it("refreshes request presentation through the real pinned loop before every model call",async()=>{
 const {g}=governor({maxTurns:2});const controller=new AbortController();let screen="clock";
 const seen:{prompt:string|undefined;tools:string[]}[]=[];
 const replies=[pressReply(["A"]),pressReply(["B"])];
 const model=scriptedModel(replies,[]);
 const loop=piLoop({systemPrompt:"full",tools:[fakePress(()=>{screen="field";})],base:{model:MODEL,convertToLlm:messages=>messages as Message[]},governor:g,transformContext:messages=>Promise.resolve(messages),emit:()=>undefined,signal:controller.signal,
 requestContext:context=>({...context,systemPrompt:screen,tools:(context.tools??[]).filter(t=>t.name==="press")}),
 streamFn:(m,context,options)=>{seen.push({prompt:context.systemPrompt,tools:context.tools?.map(t=>t.name)??[]});return model(m,context,options);}});
 expect(await play(TASK,g,loop)).toBe("budget");
 expect(seen).toEqual([{prompt:"clock",tools:["press"]},{prompt:"field",tools:["press"]}]);
});


it("stable JIT preserves provider-serialized history through unknown, naming and clock scenes in the pinned loop",async()=>{
 const {assistant}=await import("../test-support/pi.js");
 const {StableJitContext}=await import("./jit-v2-context.js");
 const {streamOpenAICompletions}=await import("@mariozechner/pi-ai/openai-completions");
 const jit=new StableJitContext({...ALL_ON,"cache-aligned-window-v1":false,"just-in-time-prompt-v1":false,"just-in-time-prompt-v2":true},null);
 jit.observe({type:"state",seq:1,screen:"main_menu",in_battle:false});
 const {g}=governor({maxTurns:4}),controller=new AbortController();
 const payloads:unknown[]=[];const seen:Message[][]=[];const replies=["A","B","A","A"].map((button,index)=>assistant({toolCalls:[{type:"toolCall",id:`jit-${String(index)}`,name:"press",arguments:{buttons:[button]}}]}));const model=scriptedModel(replies,seen);
 let sceneIndex=0;const scenes=["naming","birch_speech","clock","overworld"];
 const loop=piLoop({systemPrompt:"full",tools:[fakePress(()=>{jit.observe({type:"state",seq:++sceneIndex+1,screen:scenes[sceneIndex-1]??"overworld",in_battle:false});})],base:{model:MODEL,convertToLlm:messages=>messages as Message[]},governor:g,transformContext:messages=>Promise.resolve(messages),emit:()=>undefined,signal:controller.signal,requestContext:context=>jit.context(context),
 streamFn:async(m,context,options)=>{
  // The provider constructs the real outgoing payload, then aborts before HTTP.
  const probe=streamOpenAICompletions({...MODEL,baseUrl:"http://provider-fixture.invalid/v1"},context,{apiKey:"fixture",onPayload:payload=>{payloads.push(payload);throw new Error("test stops before HTTP");}});
  expect((await probe.result()).stopReason).toBe("error");
  return model(m,context,options);
 }});
 expect(await play(TASK,g,loop)).toBe("budget");
 const schema=Type.Object({messages:Type.Array(Type.Unknown()),tools:Type.Array(Type.Unknown())},{additionalProperties:true});
 const {Value}=await import("typebox/value");
 const parsed=payloads.map(payload=>Value.Parse(schema,payload));
 expect(parsed).toHaveLength(4);
 for(let i=1;i<parsed.length;i++){
  const before=parsed[i-1],after=parsed[i];if(before===undefined||after===undefined)throw Error("missing provider payloads");
  expect(after.messages.slice(0,before.messages.length)).toEqual(before.messages);expect(after.tools).toEqual(before.tools);
 }
 expect(parsed.map(p=>JSON.stringify(p.messages).match(/HARNESS INTERFACE GUIDANCE/g)?.length??0)).toEqual([0,1,1,2]);
 expect(JSON.stringify(parsed[0]?.messages)).not.toContain("Clock interface:");
 expect(JSON.stringify(parsed[1]?.messages.at(-1))).toContain("Naming layout,");
 expect(JSON.stringify(parsed[3]?.messages.at(-1))).toContain("Clock interface:");
});


it("records semantic refusal warnings and delivers them before the next pinned-pi decision",async()=>{
 const {RunRecorder}=await import("./recorder.js");
 const {RunLog}=await import("./run-log.js");
 const {FrameStore}=await import("./frames.js");
 const {RUN_START_META,IN_GAME}=await import("../test-support/events.js");
 const {checkEvent}=await import("./events.js");
 const root=mkdtempSync(join(tmpdir(),"pokebench-refusal-pi-"));
 try{
  const log=RunLog.create(root,"2026-10-19T15-00-00_refusal-delivery");
  const recorder=new RunRecorder({log,frames:new FrameStore(root,1000000,()=>undefined),milestones:{poll:()=>Promise.resolve([])},gameState:{read:()=>Promise.resolve(IN_GAME)}});
  await recorder.start(RUN_START_META,false);
  const {parseGameState}=await import("./game-state.js");
  const recorded=JSON.parse(gunzipSync(readFileSync(new URL("../test-support/battle-message-refusals.json.gz",import.meta.url))).toString("utf8")) as {state:unknown}[];
  const waiting=parseGameState(recorded[0]?.state);
  const controller=new AbortController();const {g}=governor({maxTurns:3});
  const detector=attachLoopGuard(recorder,g,undefined,"enforced",false,undefined,false,false,false,false,false,false,false,false,false,true);
  const refusal='Battle action: nothing pressed: the battle is not waiting for a choice; a battle message is waiting for A or B: "Go!".';
  const tool:AgentTool={name:"battle_action",label:"battle",description:"battle",parameters:Type.Object({}),execute:()=>Promise.resolve({content:[{type:"text",text:refusal}],details:{state:waiting}})};
  const seen:Message[][]=[];
  const loop=piLoop({systemPrompt:"play",tools:[tool],base:{model:MODEL,convertToLlm:m=>m as Message[]},governor:g,transformContext:recorder.transformContext,emit:recorder.emit,signal:controller.signal,loopDetector:detector,streamFn:scriptedModel([reply(["battle_action"]),reply(["battle_action"]),reply(["battle_action"])],seen)});
  expect(await play(TASK,g,loop)).toBe("budget");
  const delivered=seen[2]?.filter(m=>m.role==="user").map(m=>typeof m.content==="string"?m.content:JSON.stringify(m.content)).join("\n");
  expect(delivered).toContain("Repeated battle action refusals pressed no buttons");
  expect(delivered).toContain("A or B");
  const events=readFileSync(log.eventsPath,"utf8").trim().split("\n").map(row=>checkEvent(JSON.parse(row)));
  const warnings=events.filter(e=>e.type==="loop_guard"&&e.phase==="warning");
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toMatchObject({kind:"rejection",calls:2});
  expect(events.filter(e=>e.type==="button_press")).toEqual([]);
 }finally{rmSync(root,{recursive:true,force:true});}
});

describe("context-token-budget-v1 on the pinned pi loop", () => {
  const OVERFLOW = "400 request (5000 tokens) exceeds the available context size (4096 tokens), try increasing it";
  const run = async (budget: ContextBudget | undefined) => {
    const controller = new AbortController();
    const { g } = governor({ maxTurns: 5 });
    const seen: Message[][] = [];
    const trims: BudgetTrim[] = [];
    const loop = piLoop({
      systemPrompt: "play",
      tools: [fakePress(() => undefined)],
      base: { model: MODEL, convertToLlm: (messages) => messages as Message[] },
      governor: g,
      transformContext: (messages) => Promise.resolve(messages),
      emit: () => undefined,
      signal: controller.signal,
      streamFn: scriptedModel([pressReply(["A"]), pressReply(["B"]), pressReply(["C"]), reply([], "error", OVERFLOW), pressReply(["D"])], seen),
      ...(budget === undefined ? {} : { budget, onBudgetTrim: (trim: BudgetTrim) => { trims.push(trim); } }),
    });
    const end = await play(TASK, g, loop);
    return { end, seen, trims };
  };

  it("off: the retry after an overflow resends the same request", async () => {
    const { end, seen, trims } = await run(undefined);
    expect(end).toBe("budget");
    expect(seen[4]).toEqual(seen[3]);
    expect(trims).toEqual([]);
  });

  it("on: the retry after an overflow drops the oldest whole turns and the run goes on", async () => {
    const { end, seen, trims } = await run(new ContextBudget(3000));
    expect(end).toBe("budget");
    expect(seen.slice(0, 4)).toEqual((await run(undefined)).seen.slice(0, 4));
    expect(seen[3]).toHaveLength(7);
    expect(seen[4]?.[0]).toEqual(TASK);
    expect(seen[4]?.slice(1)).toEqual(seen[3]?.slice(5));
    expect(trims).toEqual([expect.objectContaining({ basis: "overflow", turns: 3, kept: 1, limit: 3000 })]);
  });
});
