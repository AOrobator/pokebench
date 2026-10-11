import type { AgentLoopConfig } from "@mariozechner/pi-agent-core";
import type { ThinkingLevel } from "@mariozechner/pi-ai";
import type { GatewayModel } from "./gateway.js";

// The gateway is unauthenticated, but pi refuses to stream without a key.
const GATEWAY_API_KEY = "local-stack";

export function gatewayLoopConfig(
  model: GatewayModel,
  thinking: ThinkingLevel | "off",
): AgentLoopConfig {
  const base: AgentLoopConfig = {
    model,
    maxTokens: model.maxTokens,
    convertToLlm: (messages) => messages,
    getApiKey: () => GATEWAY_API_KEY,
  };
  return thinking === "off" ? base : { ...base, reasoning: thinking };
}
