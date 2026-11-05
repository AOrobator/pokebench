import type { AgentLoopConfig } from "@mariozechner/pi-agent-core";
import type { ThinkingLevel } from "@mariozechner/pi-ai";
import type { GatewayModel } from "./gateway.js";
import type { FeatureSet } from "./features.js";
import { samplingExtras, type SamplingExtras } from "./presence-penalty.js";
import { sentEffort, withReasoningEffort } from "./reasoning-effort.js";
import { isVllm, vllmToolPayload } from "./tool-schema-dialect.js";

// The gateway is unauthenticated, but pi refuses to stream without a key.
const GATEWAY_API_KEY = "local-stack";

export function gatewayLoopConfig(
  model: GatewayModel,
  thinking: ThinkingLevel | "off",
  apiKey: string = GATEWAY_API_KEY,
  extras: SamplingExtras = {},
  effort: string | null = null,
): AgentLoopConfig {
  const vllm = isVllm(model.provider);
  const base: AgentLoopConfig = {
    model,
    maxTokens: model.maxTokens,
    convertToLlm: (messages) => messages,
    getApiKey: () => apiKey,
    // Extra OpenAI request fields (presence-penalty-v1), the reasoning effort (reasoning-effort-request-v1) and vLLM's tool-schema dialect; none keeps the plain request body.
    ...(Object.keys(extras).length === 0 && effort === null && !vllm
      ? {}
      : {
          onPayload: (payload: unknown) => {
            const sampled = typeof payload === "object" && payload !== null ? { ...payload, ...extras } : payload;
            const extended = effort === null ? sampled : withReasoningEffort(sampled, effort);
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
  fit?: (payload: unknown) => Promise<unknown>,
): AgentLoopConfig {
  const base: AgentLoopConfig = { ...gatewayLoopConfig(model, thinking, apiKey ?? GATEWAY_API_KEY, samplingExtras(features), sentEffort(features, thinking)), maxTokens };
  if (fit === undefined) return base;
  // context-exact-count-v1: the fit sees the final body, after the dialect and sampling fields.
  const inner = base.onPayload;
  return { ...base, onPayload: async (payload, current) => fit((await inner?.(payload, current)) ?? payload) };
}
