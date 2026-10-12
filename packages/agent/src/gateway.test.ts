import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  GATEWAY_COMPAT,
  GATEWAY_PROVIDER,
  GatewayDiscoveryError,
  discoverModels,
  parseModelsPayload,
  selectModel,
} from "./gateway.js";

const FIXTURE: unknown = JSON.parse(
  readFileSync(new URL("./fixtures/gateway-models.json", import.meta.url), "utf8"),
);
const GATEWAY = "http://inference.example/v1";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function lane(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: "think-swarm", context_window: 65536, max_tokens: 16384, ...overrides };
}

describe("parseModelsPayload", () => {
  it("parses the live gateway payload into typed lanes", () => {
    const lanes = parseModelsPayload(FIXTURE);
    expect(lanes.map((l) => l.id)).toEqual([
      "think-fast",
      "think-swarm",
      "think-longctx",
      "think-faster",
    ]);
    expect(lanes[2]).toEqual({
      id: "think-longctx",
      contextWindow: 262144,
      maxTokens: 32768,
      capabilities: ["completion", "multimodal"],
    });
  });

  it("accepts a lane without metadata, leaving capabilities unknown", () => {
    expect(parseModelsPayload({ data: [lane()] })).toEqual([
      { id: "think-swarm", contextWindow: 65536, maxTokens: 16384, capabilities: undefined },
    ]);
  });

  it.each<[string, unknown]>([
    ["a non-object payload", "nope"],
    ["a missing data array", { object: "list" }],
    ["an empty data array", { data: [] }],
    ["an empty id", { data: [lane({ id: "" })] }],
    ["a string context window", { data: [lane({ context_window: "65536" })] }],
    ["a zero context window", { data: [lane({ context_window: 0 })] }],
    ["a fractional max_tokens", { data: [lane({ max_tokens: 1.5 })] }],
    ["a missing max_tokens", { data: [{ id: "x", context_window: 10 }] }],
    ["max_tokens above the context window", { data: [lane({ max_tokens: 70000 })] }],
    ["non-string capabilities", { data: [lane({ metadata: { observed: { capabilities: [1] } } })] }],
    ["duplicate ids", { data: [lane(), lane()] }],
  ])("rejects %s", (_label, payload) => {
    expect(() => parseModelsPayload(payload)).toThrow(GatewayDiscoveryError);
  });
});

describe("discoverModels", () => {
  it("fetches <gateway>/models and builds pi models", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(FIXTURE));
    const models = await discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: ["think-swarm"],
      fetch: fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledWith(`${GATEWAY}/models`, expect.anything());
    expect(models).toHaveLength(4);
    const swarm = selectModel(models, "think-swarm");
    expect(swarm).toEqual({
      id: "think-swarm",
      name: "think-swarm",
      api: "openai-completions",
      provider: GATEWAY_PROVIDER,
      baseUrl: GATEWAY,
      reasoning: true,
      input: ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 65536,
      maxTokens: 16384,
      compat: GATEWAY_COMPAT,
    });
  });

  it("takes vision from the capabilities the gateway reports", async () => {
    const models = await discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: [],
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(FIXTURE)),
    });
    expect(selectModel(models, "think-swarm").input).toEqual(["text", "image"]);
    expect(selectModel(models, "think-fast").input).toEqual(["text", "image"]);
    expect(selectModel(models, "think-longctx").input).toEqual(["text", "image"]);
    expect(selectModel(models, "think-faster").input).toEqual(["text"]);
  });

  it("lets the gateway's report override config", async () => {
    const models = await discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: ["think-faster"],
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(FIXTURE)),
    });
    expect(selectModel(models, "think-faster").input).toEqual(["text"]);
  });

  it("keeps a lane with unknown capabilities text-only unless configured", async () => {
    const models = await discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: [],
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [lane()] })),
    });
    expect(selectModel(models, "think-swarm").input).toEqual(["text"]);
  });

  it("trusts config for a vision lane with unknown capabilities", async () => {
    const models = await discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: ["think-swarm"],
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [lane()] })),
    });
    expect(selectModel(models, "think-swarm").input).toEqual(["text", "image"]);
  });

  it("surfaces an HTTP error status", async () => {
    const result = discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: [],
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("down", { status: 503 })),
    });
    await expect(result).rejects.toThrow(GatewayDiscoveryError);
    await expect(result).rejects.toThrow("503");
  });

  it("surfaces a non-JSON body", async () => {
    const result = discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: [],
      fetch: vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>", { status: 200 })),
    });
    await expect(result).rejects.toThrow(GatewayDiscoveryError);
  });

  it("wraps a network failure", async () => {
    const result = discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: [],
      fetch: vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed")),
    });
    await expect(result).rejects.toThrow(GatewayDiscoveryError);
    await expect(result).rejects.toThrow("fetch failed");
  });
});

describe("selectModel", () => {
  it("names the available lanes when the id is unknown", async () => {
    const models = await discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: [],
      fetch: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ data: [lane()] })),
    });
    expect(() => selectModel(models, "think-pokebench")).toThrow(GatewayDiscoveryError);
    expect(() => selectModel(models, "think-pokebench")).toThrow("think-swarm");
  });
});
