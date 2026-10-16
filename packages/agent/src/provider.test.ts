import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import { runAgentLoop } from "@mariozechner/pi-agent-core";
import type { AssistantMessage } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { afterEach, describe, expect, it } from "vitest";
import { discoverModels, selectModel } from "./gateway.js";
import { gatewayLoopConfig, playLoopBase } from "./provider.js";
import { ALL_ON } from "./features.js";
import { PRESENCE_PENALTY } from "./presence-penalty.js";

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

describe("gatewayLoopConfig api key", () => {
  it("uses the gateway's placeholder key unless a key is given", async () => {
    const model = { provider: "p" } as unknown as Parameters<typeof gatewayLoopConfig>[0];
    expect(await gatewayLoopConfig(model, "off").getApiKey?.("p")).toBe("local-stack");
    expect(await gatewayLoopConfig(model, "off", "secret").getApiKey?.("p")).toBe("secret");
  });
});

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

// presence-penalty-v1: the bundle sends the Qwen3.6 card's thinking-mode presence_penalty with every request.
describe("presence-penalty-v1 on the wire", () => {
  async function wire(features: typeof ALL_ON): Promise<{ requests: WireRequest[]; config: ReturnType<typeof playLoopBase> }> {
    const gateway = await startFakeGateway();
    const models = await discoverModels({ gatewayUrl: gateway.url, visionModels: ["think-swarm"] });
    const config = playLoopBase(selectModel(models, "think-swarm"), "medium", "key", 4096, features);
    const prompt: AgentMessage = { role: "user", content: "What is on screen?", timestamp: 0 };
    await runAgentLoop([prompt], { systemPrompt: "Play.", messages: [], tools: [screenshotTool] }, config, () => undefined);
    return { requests: gateway.requests, config };
  }
  it("OFF sends today's request body: no presence_penalty and no payload hook", async () => {
    const { requests, config } = await wire({ ...ALL_ON, "presence-penalty-v1": false });
    expect(requests).toHaveLength(2);
    for (const request of requests) expect(request).not.toHaveProperty("presence_penalty");
    expect(config).not.toHaveProperty("onPayload");
    expect(config.maxTokens).toBe(4096);
    expect(config).toEqual({ ...gatewayLoopConfig(config.model, "medium", "key"), maxTokens: 4096 });
  });
  it("ON adds presence_penalty 1.5 to every chat request and leaves the rest of the body alone", async () => {
    const off = await wire({ ...ALL_ON, "presence-penalty-v1": false });
    const on = await wire({ ...ALL_ON, "presence-penalty-v1": true });
    expect(PRESENCE_PENALTY).toBe(1.5);
    expect(on.requests).toHaveLength(2);
    on.requests.forEach((request, i) => {
      expect(request.presence_penalty).toBe(1.5);
      const { presence_penalty: _added, ...rest } = request;
      expect(rest).toEqual(off.requests[i]);
    });
  });
});
