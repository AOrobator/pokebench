import type { AgentLoopConfig } from "@mariozechner/pi-agent-core";
import type { ThinkingLevel } from "@mariozechner/pi-ai";
import type { GatewayModel } from "./gateway.js";
import type { FeatureSet } from "./features.js";
import { samplingExtras, type SamplingExtras } from "./presence-penalty.js";
import { isVllm, vllmToolPayload } from "./tool-schema-dialect.js";

// The gateway is unauthenticated, but pi refuses to stream without a key.
const GATEWAY_API_KEY = "local-stack";

export function gatewayLoopConfig(
  model: GatewayModel,
  thinking: ThinkingLevel | "off",
  apiKey: string = GATEWAY_API_KEY,
  extras: SamplingExtras = {},
): AgentLoopConfig {
  const vllm = isVllm(model.provider);
  const base: AgentLoopConfig = {
    model,
    maxTokens: model.maxTokens,
    convertToLlm: (messages) => messages,
    getApiKey: () => apiKey,
    // Extra OpenAI request fields (presence-penalty-v1) and vLLM's tool-schema dialect; neither keeps today's request body.
    ...(Object.keys(extras).length === 0 && !vllm
      ? {}
      : {
          onPayload: (payload: unknown) => {
            const extended = typeof payload === "object" && payload !== null ? { ...payload, ...extras } : payload;
            return vllm ? vllmToolPayload(extended) : extended;
          },
        }),
  };
  return thinking === "off" ? base : { ...base, reasoning: thinking };
}

// A play run's loop base: the gateway config with the run's token cap and per-switch request fields.
export function playLoopBase(
  model: GatewayModel,
  thinking: ThinkingLevel | "off",
  apiKey: string | undefined,
  maxTokens: number,
  features: FeatureSet,
): AgentLoopConfig {
  return { ...gatewayLoopConfig(model, thinking, apiKey ?? GATEWAY_API_KEY, samplingExtras(features)), maxTokens };
}
