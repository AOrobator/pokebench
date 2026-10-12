import type { AgentMessage, AgentTool, StreamFn } from "@mariozechner/pi-agent-core";
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Message,
  type Model,
  type ToolResultMessage,
} from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { describe, expect, it } from "vitest";
import { PRESS_TIMING, pressTool } from "./game-tools.js";
import { Governor, NUDGE, OMITTED_FRAME, piLoop, play, slideWindow, type Loop } from "./harness.js";

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

function imageCount(messages: AgentMessage[]): number {
  return messages
    .flatMap((m) => (m.role === "toolResult" ? m.content : []))
    .filter((part) => part.type === "image").length;
}

describe("slideWindow", () => {
  it("keeps everything when under both limits", () => {
    const messages = [TASK, reply(), toolResult(), reply(), toolResult()];
    expect(slideWindow(messages, { turns: 20, images: 3 })).toEqual(messages);
  });

  it("returns an empty context unchanged", () => {
    expect(slideWindow([], { turns: 20, images: 3 })).toEqual([]);
  });

  it("drops whole old turns but always keeps the task", () => {
    const turns = Array.from({ length: 5 }, (_, i) => [reply([`t${String(i)}`]), toolResult(0)]).flat();
    const window = slideWindow([TASK, ...turns], { turns: 2, images: 3 });
    expect(window[0]).toBe(TASK);
    expect(window.slice(1)).toEqual(turns.slice(6));
    expect(window[1]?.role).toBe("assistant");
  });

  it("keeps only the newest screenshots as images and marks older ones", () => {
    const messages = [TASK, reply(), toolResult(1), reply(), toolResult(2), reply(), toolResult(1)];
    const window = slideWindow(messages, { turns: 20, images: 3 });
    expect(imageCount(window)).toBe(3);
    const first = window[2] as ToolResultMessage;
    expect(first.content).toEqual([{ type: "text", text: "Location: X" }, { type: "text", text: OMITTED_FRAME }]);
    const second = window[4] as ToolResultMessage;
    expect(second.content.map((part) => part.type)).toEqual(["text", "image", "image"]);
    expect(messages[2]).toEqual(toolResult(1));
  });

  it("drops a nudge that precedes the oldest kept turn", () => {
    const nudge: AgentMessage = { role: "user", content: NUDGE, timestamp: 0 };
    const messages = [TASK, reply(), toolResult(0), reply([]), nudge, reply(), toolResult(0)];
    expect(slideWindow(messages, { turns: 1, images: 3 })).toEqual([TASK, reply(), toolResult(0)]);
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
