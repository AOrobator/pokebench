import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it, vi } from "vitest";
import { SmokeError, checkSmoke, pressTool, screenshotTool, serverHealthy, stateTool } from "./game-tools.js";

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

const STATE = { player: { location: "LITTLEROOT TOWN" }, step_number: 4 };

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

describe("screenshotTool", () => {
  it("returns the 240x160 frame as image content", async () => {
    const fetchFn = serving({ screenshot_base64: png(240, 160), step_number: 3 });
    const result = await screenshotTool(SERVER, fetchFn).execute("call-1", {});
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/screenshot`, expect.anything());
    expect(result.content).toEqual([{ type: "image", data: png(240, 160), mimeType: "image/png" }]);
  });

  it.each([
    ["a wrong-size frame", { screenshot_base64: png(100, 100), step_number: 1 }],
    ["a non-PNG frame", { screenshot_base64: Buffer.from("GIF89a, padded to be long enough").toString("base64"), step_number: 1 }],
    ["a missing frame", { step_number: 1 }],
  ])("rejects %s", async (_label, body) => {
    await expect(screenshotTool(SERVER, serving(body)).execute("call-1", {})).rejects.toThrow(/screenshot/);
  });

  it("names the path on an HTTP error", async () => {
    await expect(screenshotTool(SERVER, serving({}, 503)).execute("call-1", {})).rejects.toThrow(/\/screenshot.*503/);
  });
});

describe("stateTool", () => {
  it("returns the state as JSON text", async () => {
    const result = await stateTool(SERVER, serving(STATE)).execute("call-2", {});
    expect(result.content).toEqual([{ type: "text", text: JSON.stringify(STATE) }]);
  });

  it("rejects a malformed state", async () => {
    await expect(stateTool(SERVER, serving({ player: {} })).execute("call-2", {})).rejects.toThrow(/state/);
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
      result("screenshot"),
      assistant(" A title screen. "),
      result("state"),
      assistant("DONE TITLE_SEQUENCE"),
    ];
    expect(checkSmoke(transcript)).toEqual({
      toolCalls: ["screenshot", "state"],
      texts: ["A title screen.", "DONE TITLE_SEQUENCE"],
    });
  });

  it.each([
    ["a failed tool", [result("screenshot"), result("state", true), assistant("a"), assistant("b")], /failed: state/],
    ["no screenshot", [result("state"), assistant("a"), assistant("b")], /screenshot/],
    ["no state call", [result("screenshot"), assistant("a"), assistant("b")], /state/],
    [
      "a terminal model error",
      [result("screenshot"), assistant("a"), result("state"), assistant("b"), assistant("", "error")],
      /model turn ended: error/,
    ],
    [
      "an aborted model turn",
      [result("screenshot"), assistant("a"), result("state"), assistant("b"), assistant("", "aborted")],
      /model turn ended: aborted/,
    ],
    ["a single reply", [result("screenshot"), result("state"), assistant("a"), assistant("")], /frame description/],
  ])("fails on %s", (_label, transcript, message) => {
    expect(() => checkSmoke(transcript)).toThrow(SmokeError);
    expect(() => checkSmoke(transcript)).toThrow(message);
  });
});

describe("pressTool", () => {
  it("records the press before POSTing it, then checks milestones", async () => {
    const order: string[] = [];
    const fetchFn = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      order.push(`POST ${typeof init?.body === "string" ? init.body : ""}`);
      return Promise.resolve(new Response(JSON.stringify({ status: "success" })));
    });
    const tool = pressTool(SERVER, {
      beforePress: (id, buttons) => {
        order.push(`before ${id} ${buttons.join(",")}`);
      },
      afterPress: () => {
        order.push("after");
        return Promise.resolve();
      },
    }, fetchFn);
    const result = await tool.execute("call-9", { buttons: ["UP", "A"] });
    expect(order).toEqual(["before call-9 UP,A", 'POST {"buttons":["UP","A"]}', "after"]);
    expect(fetchFn).toHaveBeenCalledWith(`${SERVER}/action`, expect.objectContaining({ method: "POST" }));
    expect(result.content).toEqual([{ type: "text", text: "pressed UP, A" }]);
  });

  it("fails when the server does not report success", async () => {
    const tool = pressTool(SERVER, { beforePress: () => undefined, afterPress: () => Promise.resolve() }, serving({ status: "error", message: "queue full" }));
    await expect(tool.execute("c", { buttons: ["A"] })).rejects.toThrow(/queue full/);
  });

  it("declares a closed button enum and a bounded list", () => {
    const tool = pressTool(SERVER, { beforePress: () => undefined, afterPress: () => Promise.resolve() });
    expect(JSON.stringify(tool.parameters)).toContain('"maxItems":8');
    expect(JSON.stringify(tool.parameters)).toContain('"SELECT"');
  });
});
