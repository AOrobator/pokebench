import { afterEach, describe, expect, it } from "vitest";
import { GATEWAY_MODELS, must, startFakeGateway, type FakeGateway } from "../test-support/fake-gateway.js";
import { GatewayError, discoverLanes, parseLanes, selectLane, toPiModel } from "./gateway.js";

describe("parseLanes", () => {
  it("reads limits and vision from the gateway's own payload", () => {
    expect(parseLanes(GATEWAY_MODELS)).toEqual([
      { id: "think-swarm", contextWindow: 65536, maxTokens: 16384, vision: true },
      { id: "think-faster", contextWindow: 4096, maxTokens: 1024, vision: false },
      { id: "bare-lane", contextWindow: 8192, maxTokens: 2048, vision: false },
    ]);
  });

  it.each([
    ["a non-object payload", []],
    ["a missing data array", { object: "list" }],
    ["a non-object entry", { data: ["think-swarm"] }],
    ["a blank id", { data: [{ id: " ", context_window: 1, max_tokens: 1 }] }],
    ["a missing context window", { data: [{ id: "a", max_tokens: 1 }] }],
    ["a fractional context window", { data: [{ id: "a", context_window: 1.5, max_tokens: 1 }] }],
    ["a zero max_tokens", { data: [{ id: "a", context_window: 8, max_tokens: 0 }] }],
    ["non-list capabilities", { data: [{ id: "a", context_window: 8, max_tokens: 1, metadata: { observed: { capabilities: "multimodal" } } }] }],
  ])("rejects %s", (_label, payload) => {
    expect(() => parseLanes(payload)).toThrow(GatewayError);
  });
});

describe("toPiModel", () => {
  const [swarm, faster] = parseLanes(GATEWAY_MODELS);
  const vision = must(swarm);
  const textOnly = must(faster);

  it("maps a vision lane onto an openai-completions model tuned for the llama.cpp gateway", () => {
    const model = toPiModel(vision, "http://inference.example/v1");
    expect(model).toMatchObject({
      id: "think-swarm",
      name: "think-swarm",
      api: "openai-completions",
      provider: "local stack",
      baseUrl: "http://inference.example/v1",
      reasoning: true,
      input: ["text", "image"],
      contextWindow: 65536,
      maxTokens: 16384,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: {
        thinkingFormat: "qwen-chat-template",
        maxTokensField: "max_tokens",
        supportsStore: false,
        supportsDeveloperRole: false,
        supportsReasoningEffort: false,
        supportsStrictMode: false,
      },
    });
  });

  it("gives a text-only lane no image input", () => {
    expect(toPiModel(textOnly, "http://inference.example/v1").input).toEqual(["text"]);
  });
});

describe("selectLane", () => {
  const lanes = parseLanes(GATEWAY_MODELS);

  it("finds the configured lane", () => {
    expect(selectLane(lanes, "think-faster").id).toBe("think-faster");
  });

  it("names the available lanes when the configured one is missing", () => {
    expect(() => selectLane(lanes, "think-pokebench")).toThrow(/think-pokebench.*think-swarm, think-faster, bare-lane/);
  });
});

describe("discoverLanes", () => {
  let gateway: FakeGateway | undefined;
  afterEach(async () => {
    await gateway?.close();
    gateway = undefined;
  });

  it("fetches /models from the gateway", async () => {
    gateway = await startFakeGateway({ models: GATEWAY_MODELS });
    const lanes = await discoverLanes(gateway.url);
    expect(lanes.map((lane) => lane.id)).toEqual(["think-swarm", "think-faster", "bare-lane"]);
  });

  it("turns an HTTP error into a GatewayError", async () => {
    gateway = await startFakeGateway({ modelsStatus: 503 });
    await expect(discoverLanes(gateway.url)).rejects.toThrow(/503/);
  });

  it("turns an unreachable gateway into a GatewayError", async () => {
    gateway = await startFakeGateway({});
    const url = gateway.url;
    await gateway.close();
    gateway = undefined;
    await expect(discoverLanes(url)).rejects.toThrow(GatewayError);
  });
});
