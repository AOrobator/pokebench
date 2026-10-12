import type { Model } from "@mariozechner/pi-ai";
import { isObject } from "./json.js";

export const GATEWAY_PROVIDER = "local stack";

export class GatewayError extends Error {
  override readonly name = "GatewayError";
}

export interface GatewayLane {
  readonly id: string;
  readonly contextWindow: number;
  readonly maxTokens: number;
  readonly vision: boolean;
}

function positiveInt(value: unknown, where: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new GatewayError(`${where}: expected a positive integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

function capabilities(entry: Readonly<Record<string, unknown>>, where: string): readonly unknown[] {
  const metadata = entry.metadata;
  const observed = isObject(metadata) ? metadata.observed : undefined;
  const raw = isObject(observed) ? observed.capabilities : undefined;
  if (raw === undefined) {
    return [];
  }
  if (!Array.isArray(raw)) {
    throw new GatewayError(`${where}.metadata.observed.capabilities: expected a list`);
  }
  return raw;
}

export function parseLanes(payload: unknown): GatewayLane[] {
  if (!isObject(payload) || !Array.isArray(payload.data)) {
    throw new GatewayError("/models: expected an object with a data list");
  }
  return payload.data.map((entry: unknown, index) => {
    const where = `/models.data[${String(index)}]`;
    if (!isObject(entry)) {
      throw new GatewayError(`${where}: expected an object`);
    }
    if (typeof entry.id !== "string" || entry.id.trim() === "") {
      throw new GatewayError(`${where}.id: expected a non-blank string`);
    }
    return {
      id: entry.id,
      contextWindow: positiveInt(entry.context_window, `${where}.context_window`),
      maxTokens: positiveInt(entry.max_tokens, `${where}.max_tokens`),
      vision: capabilities(entry, where).includes("multimodal"),
    };
  });
}

export async function discoverLanes(gatewayUrl: string): Promise<GatewayLane[]> {
  let response: Response;
  try {
    response = await fetch(`${gatewayUrl}/models`);
  } catch (error) {
    throw new GatewayError(`GET ${gatewayUrl}/models failed: ${String(error)}`);
  }
  if (!response.ok) {
    throw new GatewayError(`GET ${gatewayUrl}/models returned ${String(response.status)}`);
  }
  return parseLanes(await response.json());
}

export function selectLane(lanes: readonly GatewayLane[], id: string): GatewayLane {
  const lane = lanes.find((candidate) => candidate.id === id);
  if (lane === undefined) {
    throw new GatewayError(`lane ${id} is not served; available: ${lanes.map((l) => l.id).join(", ")}`);
  }
  return lane;
}

export function toPiModel(lane: GatewayLane, gatewayUrl: string): Model<"openai-completions"> {
  return {
    id: lane.id,
    name: lane.id,
    api: "openai-completions",
    provider: GATEWAY_PROVIDER,
    baseUrl: gatewayUrl,
    reasoning: true,
    input: lane.vision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: lane.contextWindow,
    maxTokens: lane.maxTokens,
    compat: {
      thinkingFormat: "qwen-chat-template",
      maxTokensField: "max_tokens",
      supportsStore: false,
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStrictMode: false,
    },
  };
}
