import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { runAgentLoop } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { discoverModels, selectModel } from "./gateway.js";
import { gatewayLoopConfig } from "./provider.js";

// 1x1 transparent PNG.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const REASONING = "I need to look at the screen first.";

interface WireMessage {
  readonly role: string;
  readonly content?: unknown;
  readonly reasoning_content?: unknown;
  readonly tool_calls?: readonly { readonly function: { readonly name: string } }[];
  readonly tool_call_id?: string;
}

interface WireRequest {
  readonly model: string;
  readonly messages: readonly WireMessage[];
  readonly [key: string]: unknown;
}

function chunk(delta: Record<string, unknown>, finish: string | null = null): string {
  const body = {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 0,
    model: "lane",
    choices: [{ index: 0, delta, finish_reason: finish }],
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

const TOOL_TURN = [
  chunk({ role: "assistant", reasoning_content: "I need to look " }),
  chunk({ reasoning_content: "at the screen first." }),
  chunk({
    tool_calls: [
      { index: 0, id: "call_1", type: "function", function: { name: "screenshot", arguments: "{}" } },
    ],
  }),
  chunk({}, "tool_calls"),
  "data: [DONE]\n\n",
];

const FINAL_TURN = [
  chunk({ role: "assistant", content: "A blank frame." }),
  chunk({}, "stop"),
  "data: [DONE]\n\n",
];

interface FakeGateway {
  readonly url: string;
  readonly requests: WireRequest[];
}

let server: Server | undefined;

afterEach(async () => {
  const current = server;
  server = undefined;
  if (current) {
    await new Promise<void>((resolve) => {
      current.close(() => {
        resolve();
      });
    });
  }
});

async function startFakeGateway(): Promise<FakeGateway> {
  const requests: WireRequest[] = [];
  const models = {
    object: "list",
    data: [
      { id: "think-swarm", context_window: 65536, max_tokens: 16384 },
      { id: "think-faster", context_window: 4096, max_tokens: 1024 },
    ],
  };
  const srv = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(models));
      return;
    }
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", (part: string) => (raw += part));
    req.on("end", () => {
      requests.push(JSON.parse(raw) as WireRequest);
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const line of requests.length === 1 ? TOOL_TURN : FINAL_TURN) res.write(line);
      res.end();
    });
  });
  server = srv;
  await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
  const { port } = srv.address() as AddressInfo;
  return { url: `http://127.0.0.1:${String(port)}/v1`, requests };
}

const screenshotTool: AgentTool = {
  name: "screenshot",
  label: "Screenshot",
  description: "Capture the current game frame.",
  parameters: Type.Object({}),
  execute: () =>
    Promise.resolve({
      content: [{ type: "image", data: PNG_B64, mimeType: "image/png" }],
      details: undefined,
    }),
};

async function runScreenshotTurn(laneId: string): Promise<{
  readonly gateway: FakeGateway;
  readonly transcript: AgentMessage[];
}> {
  const gateway = await startFakeGateway();
  const models = await discoverModels({ gatewayUrl: gateway.url, visionModels: ["think-swarm"] });
  const config = gatewayLoopConfig(selectModel(models, laneId), "medium");
  const prompt: AgentMessage = { role: "user", content: "What is on screen?", timestamp: 0 };
  const transcript = await runAgentLoop(
    [prompt],
    { systemPrompt: "You play Pokémon Emerald.", messages: [], tools: [screenshotTool] },
    config,
    () => undefined,
  );
  return { gateway, transcript };
}

function secondRequest(gateway: FakeGateway): WireRequest {
  expect(gateway.requests).toHaveLength(2);
  const request = gateway.requests[1];
  if (request === undefined) throw new Error("no second request");
  return request;
}

function imageUrls(request: WireRequest): string[] {
  return request.messages.flatMap((m) =>
    Array.isArray(m.content)
      ? m.content.flatMap((part: unknown) => {
          const p = part as { type?: string; image_url?: { url?: string } };
          return p.type === "image_url" && p.image_url?.url ? [p.image_url.url] : [];
        })
      : [],
  );
}

describe("gateway round trip through the agent loop", () => {
  it("sends a tool's screenshot to a vision lane as an image_url", async () => {
    const { gateway } = await runScreenshotTurn("think-swarm");
    const request = secondRequest(gateway);

    expect(request.model).toBe("think-swarm");
    expect(request.messages.map((m) => m.role)).toEqual([
      "system",
      "user",
      "assistant",
      "tool",
      "user",
    ]);
    expect(request.messages[3]?.tool_call_id).toBe("call_1");
    expect(imageUrls(request)).toEqual([`data:image/png;base64,${PNG_B64}`]);
  });

  it("replays the turn's reasoning as reasoning_content with preserve_thinking", async () => {
    const { gateway, transcript } = await runScreenshotTurn("think-swarm");
    const request = secondRequest(gateway);

    const assistant = request.messages[2];
    expect(assistant?.reasoning_content).toBe(REASONING);
    expect(assistant?.tool_calls?.[0]?.function.name).toBe("screenshot");
    expect(request.chat_template_kwargs).toEqual({ enable_thinking: true, preserve_thinking: true });

    const firstReply = transcript.find((m): m is AssistantMessage => m.role === "assistant");
    expect(firstReply?.content[0]).toMatchObject({ type: "thinking", thinking: REASONING });
  });

  it("speaks the gateway's dialect: system role, max_tokens, no store or reasoning_effort", async () => {
    const { gateway } = await runScreenshotTurn("think-swarm");
    for (const request of gateway.requests) {
      expect(request.messages[0]?.role).toBe("system");
      expect(request.max_tokens).toBe(16384);
      expect(request).not.toHaveProperty("max_completion_tokens");
      expect(request).not.toHaveProperty("store");
      expect(request).not.toHaveProperty("reasoning_effort");
    }
  });

  it("never sends image bytes to a lane not configured for vision", async () => {
    const { gateway } = await runScreenshotTurn("think-faster");
    const request = secondRequest(gateway);

    expect(imageUrls(request)).toEqual([]);
    expect(JSON.stringify(request)).not.toContain(PNG_B64);
    expect(request.max_tokens).toBe(1024);
  });
});

describe("gatewayLoopConfig", () => {
  it("disables thinking when the level is off", async () => {
    const gateway = await startFakeGateway();
    const models = await discoverModels({ gatewayUrl: gateway.url, visionModels: [] });
    const config = gatewayLoopConfig(selectModel(models, "think-swarm"), "off");
    expect(config).not.toHaveProperty("reasoning");
    expect(await config.getApiKey?.(config.model.provider)).toBeTruthy();
  });
});
