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

// fleet_catalog.rs emits unavailable capacity without registry fallback.
function unavailable(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "stopped",
    object: "model",
    owned_by: "local-inference-stack",
    created: 0,
    context_window: null,
    max_tokens: null,
    metadata: {
      source: "unavailable",
      context_tokens: null,
      max_response_tokens: null,
    },
    ...overrides,
  };
}

describe("explicit fleet availability through discovery and selection", () => {
  it.each([true, false])(
    "discovers the healthy requested lane with an unavailable neighbor (offline first=%s)",
    async (offlineFirst) => {
      const live = lane({
        id: "healthy",
        metadata: {
          source: "live",
          observed: { capabilities: ["multimodal"] },
        },
      });
      const offline = unavailable();
      const models = await discoverModels({
        gatewayUrl: GATEWAY,
        visionModels: [],
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            jsonResponse({
              data: offlineFirst ? [offline, live] : [live, offline],
            }),
          ),
      });
      expect(models.map((model) => model.id)).toEqual(["healthy"]);
      const selected = selectModel(models, "healthy");
      expect({
        id: selected.id,
        contextWindow: selected.contextWindow,
        maxTokens: selected.maxTokens,
        input: selected.input,
      }).toEqual({
        id: "healthy",
        contextWindow: 65536,
        maxTokens: 16384,
        input: ["text", "image"],
      });
      expect(() => selectModel(models, "stopped")).toThrow(
        /stopped.*not served.*healthy/,
      );
    },
  );

  it("returns no usable models when every row is explicitly unavailable, without fallback", async () => {
    const models = await discoverModels({
      gatewayUrl: GATEWAY,
      visionModels: ["stopped"],
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(jsonResponse({ data: [unavailable()] })),
    });
    expect(models).toEqual([]);
    expect(() => selectModel(models, "stopped")).toThrow(/stopped.*not served/);
  });

  it.each<[string, Record<string, unknown>]>([
    ["null capacity without provenance", unavailable({ metadata: {} })],
    [
      "null capacity declared live",
      unavailable({ metadata: { source: "live" } }),
    ],
    ["unknown source marker", unavailable({ metadata: { source: "cached" } })],
    ["mixed null and live capacity", unavailable({ max_tokens: 100 })],
    [
      "positive capacities declared unavailable",
      lane({ id: "stopped", metadata: { source: "unavailable" } }),
    ],
    [
      "malformed live neighbor",
      lane({ id: "malformed", context_window: "65536" }),
    ],
    [
      "unavailable row with malformed capabilities",
      unavailable({
        metadata: {
          source: "unavailable",
          context_tokens: null,
          max_response_tokens: null,
          observed: { capabilities: [1] },
        },
      }),
    ],
  ])(
    "refuses %s instead of silently filtering malformed rows",
    async (_label, bad) => {
      const result = discoverModels({
        gatewayUrl: GATEWAY,
        visionModels: [],
        fetch: vi
          .fn<typeof fetch>()
          .mockResolvedValue(
            jsonResponse({ data: [lane({ id: "healthy" }), bad] }),
          ),
      });
      await expect(result).rejects.toThrow(GatewayDiscoveryError);
    },
  );

  it.each(["live-offline", "offline-live", "offline-offline"])(
    "rejects duplicate identity across %s rows",
    async (kind) => {
      const live = lane({ id: "shared" });
      const offline = unavailable({ id: "shared" });
      const data =
        kind === "live-offline"
          ? [live, offline]
          : kind === "offline-live"
            ? [offline, live]
            : [offline, offline];
      await expect(
        discoverModels({
          gatewayUrl: GATEWAY,
          visionModels: [],
          fetch: vi
            .fn<typeof fetch>()
            .mockResolvedValue(jsonResponse({ data })),
        }),
      ).rejects.toThrow("duplicate lane id shared");
    },
  );
});
