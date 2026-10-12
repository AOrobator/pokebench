import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { SmokeError, checkSmoke, observeTool, pressTool, serverHealthy, waitForQueue } from "./game-tools.js";

const SERVER = "http://127.0.0.1:8000";

function png(width: number, height: number): string {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString("base64");
}

function serving(body: unknown, status = 200): typeof fetch {
  return vi.fn<typeof fetch>().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status })),
  );
}

function observationBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { state_text: "Current Location: LITTLEROOT TOWN", screenshot_base64: png(240, 160), step_number: 4, ...overrides };
}

type Route = (init: RequestInit | undefined) => unknown;

function routes(table: Record<string, unknown>, calls: string[] = []): typeof fetch {
  return vi.fn<typeof fetch>().mockImplementation((input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.slice(SERVER.length);
    calls.push(`${init?.method ?? "GET"} ${path}`);
    const entry = table[path];
    if (entry === undefined) return Promise.resolve(new Response("{}", { status: 404 }));
    const body: unknown = typeof entry === "function" ? (entry as Route)(init) : entry;
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
}

const noHooks = { beforePress: () => undefined, afterPress: () => Promise.resolve() };
const instant = { sleep: () => Promise.resolve(), now: () => 0 };

describe("serverHealthy", () => {
  it("is true only for a healthy status", async () => {
    expect(await serverHealthy(SERVER, serving({ status: "healthy" }))).toBe(true);
    expect(await serverHealthy(SERVER, serving({ status: "booting" }))).toBe(false);
    expect(await serverHealthy(SERVER, serving({}, 500))).toBe(false);
  });

  it("is false when nothing is listening", async () => {
    const refused = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await serverHealthy(SERVER, refused)).toBe(false);
  });
});

describe("observeTool", () => {
  it("returns the 240x160 frame then the state text", async () => {
    const fetchFn = serving(observationBody());
    const result = await observeTool(SERVER, fetchFn).execute("call-1", {});
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/pokebench/observation`, expect.anything());
    expect(result.content).toEqual([
      { type: "image", data: png(240, 160), mimeType: "image/png" },
      { type: "text", text: "Current Location: LITTLEROOT TOWN" },
    ]);
  });

  it("accepts a null step number", async () => {
    const result = await observeTool(SERVER, serving(observationBody({ step_number: null }))).execute("c", {});
    expect(result.content).toHaveLength(2);
  });

  it.each([
    ["a wrong-size frame", observationBody({ screenshot_base64: png(100, 100) })],
    ["a non-PNG frame", observationBody({ screenshot_base64: Buffer.from("GIF89a, padded to be long enough").toString("base64") })],
    ["a missing frame", observationBody({ screenshot_base64: undefined })],
    ["missing state text", observationBody({ state_text: undefined })],
  ])("rejects %s", async (_label, body) => {
    await expect(observeTool(SERVER, serving(body)).execute("call-1", {})).rejects.toThrow(/observation/);
  });

  it("names the path on an HTTP error", async () => {
    await expect(observeTool(SERVER, serving({}, 503)).execute("call-1", {})).rejects.toThrow(
      /\/pokebench\/observation.*503/,
    );
  });
});

function assistant(text: string, stopReason: "stop" | "error" | "aborted" = "stop"): AgentMessage {
  return {
    role: "assistant",
    content: text === "" ? [] : [{ type: "text", text }],
    api: "openai-completions",
    provider: "local-gateway",
    model: "think-swarm",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: 0,
  };
}

function result(toolName: string, isError = false): AgentMessage {
  return { role: "toolResult", toolCallId: toolName, toolName, content: [], isError, timestamp: 0 };
}

describe("checkSmoke", () => {
  it("summarizes a transcript that described a frame and called both tools", () => {
    const transcript = [
      result("observe"),
      assistant(" A title screen. "),
      result("press"),
      assistant("DONE TITLE_SEQUENCE"),
    ];
    expect(checkSmoke(transcript)).toEqual({
      toolCalls: ["observe", "press"],
      texts: ["A title screen.", "DONE TITLE_SEQUENCE"],
    });
  });

  it.each([
    ["a failed tool", [result("observe"), result("press", true), assistant("a"), assistant("b")], /failed: press/],
    ["no observe", [result("press"), assistant("a"), assistant("b")], /observe/],
    ["no press", [result("observe"), assistant("a"), assistant("b")], /press/],
    [
      "a terminal model error",
      [result("observe"), assistant("a"), result("press"), assistant("b"), assistant("", "error")],
      /model turn ended: error/,
    ],
    [
      "an aborted model turn",
      [result("observe"), assistant("a"), result("press"), assistant("b"), assistant("", "aborted")],
      /model turn ended: aborted/,
    ],
    ["a single reply", [result("observe"), result("press"), assistant("a"), assistant("")], /frame description/],
  ])("fails on %s", (_label, transcript, message) => {
    expect(() => checkSmoke(transcript)).toThrow(SmokeError);
    expect(() => checkSmoke(transcript)).toThrow(message);
  });
});

describe("waitForQueue", () => {
  it("polls until the action queue drains", async () => {
    let polls = 0;
    const fetchFn = routes({ "/queue_status": () => ({ queue_empty: ++polls >= 3 }) });
    const sleeps: number[] = [];
    await waitForQueue(SERVER, fetchFn, {
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
      now: () => 0,
    });
    expect(polls).toBe(3);
    expect(sleeps).toEqual([100, 100]);
  });

  it("gives up after the timeout", async () => {
    let clock = 0;
    const fetchFn = routes({ "/queue_status": { queue_empty: false } });
    const wait = waitForQueue(SERVER, fetchFn, {
      sleep: () => {
        clock += 5_000;
        return Promise.resolve();
      },
      now: () => clock,
    });
    await expect(wait).rejects.toThrow(/queue did not drain/);
  });

  it("rejects a malformed queue status", async () => {
    await expect(waitForQueue(SERVER, routes({ "/queue_status": {} }), instant)).rejects.toThrow(/queue_status/);
  });
});

describe("pressTool", () => {
  it("records the press before POSTing it, waits for the queue, checks milestones, then observes", async () => {
    const order: string[] = [];
    const fetchFn = routes(
      {
        "/action": { status: "success" },
        "/queue_status": { queue_empty: true },
        "/pokebench/observation": observationBody(),
      },
      order,
    );
    const tool = pressTool(
      SERVER,
      {
        beforePress: (id, buttons) => {
          order.push(`before ${id} ${buttons.join(",")}`);
        },
        afterPress: () => {
          order.push("after");
          return Promise.resolve();
        },
      },
      fetchFn,
      instant,
    );
    const result = await tool.execute("call-9", { buttons: ["UP", "A"] });
    expect(order).toEqual([
      "before call-9 UP,A",
      "POST /action",
      "GET /queue_status",
      "after",
      "GET /pokebench/observation",
    ]);
    expect(fetchFn).toHaveBeenCalledWith(
      `${SERVER}/action`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ buttons: ["UP", "A"] }) }),
    );
    expect(result.content).toEqual([
      { type: "image", data: png(240, 160), mimeType: "image/png" },
      { type: "text", text: "pressed UP, A\n\nCurrent Location: LITTLEROOT TOWN" },
    ]);
  });

  it("fails when the server does not report success", async () => {
    const tool = pressTool(SERVER, noHooks, routes({ "/action": { status: "error", message: "queue full" } }), instant);
    await expect(tool.execute("c", { buttons: ["A"] })).rejects.toThrow(/queue full/);
  });

  it("names the HTTP status when the body is not an action reply", async () => {
    const tool = pressTool(SERVER, noHooks, routes({}), instant);
    await expect(tool.execute("c", { buttons: ["A"] })).rejects.toThrow(/HTTP 404/);
  });

  it("declares a closed button enum and a bounded list", () => {
    const tool = pressTool(SERVER, noHooks);
    expect(JSON.stringify(tool.parameters)).toContain('"maxItems":8');
    expect(JSON.stringify(tool.parameters)).toContain('"SELECT"');
  });
});
