import type { Model, OpenAICompletionsCompat } from "@mariozechner/pi-ai";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

export const GATEWAY_PROVIDER = "local-gateway";

// The gateway fronts llama.cpp serving Qwen chat templates. Images from tool
// results arrive in a synthetic user turn, which the Qwen template treats as a
// new query and so drops earlier reasoning unless preserve_thinking is set;
// the qwen-chat-template format sends it.
export const GATEWAY_COMPAT: OpenAICompletionsCompat = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: false,
  maxTokensField: "max_tokens",
  thinkingFormat: "qwen-chat-template",
};

export type GatewayModel = Model<"openai-completions">;

export interface GatewayLane {
  readonly id: string;
  readonly contextWindow: number;
  readonly maxTokens: number;
  readonly capabilities: readonly string[] | undefined;
}

export class GatewayDiscoveryError extends Error {
  override readonly name = "GatewayDiscoveryError";
}

const PositiveInt = Type.Integer({ minimum: 1 });

const LaneSchema = Type.Object({
  id: Type.String({ minLength: 1 }),
  context_window: PositiveInt,
  max_tokens: PositiveInt,
  metadata: Type.Optional(
    Type.Object({
      observed: Type.Optional(
        Type.Object({ capabilities: Type.Optional(Type.Array(Type.String())) }),
      ),
    }),
  ),
});

const PayloadSchema = Type.Object({ data: Type.Array(LaneSchema, { minItems: 1 }) });

type LanePayload = Static<typeof LaneSchema>;

function toLane(raw: LanePayload): GatewayLane {
  if (raw.max_tokens > raw.context_window) {
    throw new GatewayDiscoveryError(
      `lane ${raw.id}: max_tokens ${String(raw.max_tokens)} exceeds context_window ${String(raw.context_window)}`,
    );
  }
  return {
    id: raw.id,
    contextWindow: raw.context_window,
    maxTokens: raw.max_tokens,
    capabilities: raw.metadata?.observed?.capabilities,
  };
}

export function parseModelsPayload(payload: unknown): GatewayLane[] {
  if (!Value.Check(PayloadSchema, payload)) {
    const first = Value.Errors(PayloadSchema, payload)[0];
    const where = first ? `${first.instancePath || "/"}: ${first.message}` : "invalid";
    throw new GatewayDiscoveryError(`malformed /v1/models payload at ${where}`);
  }
  const lanes = payload.data.map(toLane);
  const seen = new Set<string>();
  for (const lane of lanes) {
    if (seen.has(lane.id)) throw new GatewayDiscoveryError(`duplicate lane id ${lane.id}`);
    seen.add(lane.id);
  }
  return lanes;
}

function toPiModel(lane: GatewayLane, gatewayUrl: string, configuredVision: boolean): GatewayModel {
  const vision = lane.capabilities?.includes("multimodal") ?? configuredVision;
  return {
    id: lane.id,
    name: lane.id,
    api: "openai-completions",
    provider: GATEWAY_PROVIDER,
    baseUrl: gatewayUrl,
    reasoning: true,
    input: vision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: lane.contextWindow,
    maxTokens: lane.maxTokens,
    compat: GATEWAY_COMPAT,
  };
}

export interface DiscoveryOptions {
  readonly gatewayUrl: string;
  readonly visionModels: readonly string[];
  readonly fetch?: typeof fetch;
}

async function fetchPayload(url: string, fetchFn: typeof fetch): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, { headers: { accept: "application/json" } });
  } catch (error) {
    throw new GatewayDiscoveryError(`GET ${url} failed: ${String(error)}`, { cause: error });
  }
  if (!response.ok) {
    throw new GatewayDiscoveryError(`GET ${url} returned HTTP ${String(response.status)}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new GatewayDiscoveryError(`GET ${url} returned a non-JSON body`, { cause: error });
  }
}

export async function discoverModels(options: DiscoveryOptions): Promise<GatewayModel[]> {
  const url = `${options.gatewayUrl}/models`;
  const lanes = parseModelsPayload(await fetchPayload(url, options.fetch ?? fetch));
  const vision = new Set(options.visionModels);
  return lanes.map((lane) => toPiModel(lane, options.gatewayUrl, vision.has(lane.id)));
}

export function selectModel(models: readonly GatewayModel[], id: string): GatewayModel {
  const model = models.find((m) => m.id === id);
  if (model === undefined) {
    const available = models.map((m) => m.id).join(", ");
    throw new GatewayDiscoveryError(`model ${id} is not served by the gateway (available: ${available})`);
  }
  return model;
}
