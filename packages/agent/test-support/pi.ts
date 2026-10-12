import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, StopReason, ToolCall } from "@mariozechner/pi-ai";

export function userText(text: string): AgentMessage {
  return { role: "user", content: text, timestamp: 0 };
}

export function userImage(): AgentMessage {
  return {
    role: "user",
    content: [
      { type: "text", text: "frame" },
      { type: "image", data: "AAAA", mimeType: "image/png" },
    ],
    timestamp: 0,
  };
}

export interface AssistantParts {
  readonly thinking?: string;
  readonly text?: string;
  readonly toolCalls?: readonly ToolCall[];
  readonly stopReason?: StopReason;
  readonly errorMessage?: string;
  readonly input?: number;
  readonly output?: number;
}

export function assistant(parts: AssistantParts = {}): AssistantMessage {
  const content: AssistantMessage["content"] = [];
  if (parts.thinking !== undefined) {
    content.push({ type: "thinking", thinking: parts.thinking, thinkingSignature: "reasoning_content" });
  }
  if (parts.text !== undefined) content.push({ type: "text", text: parts.text });
  content.push(...(parts.toolCalls ?? []));
  const message: AssistantMessage = {
    role: "assistant",
    content,
    api: "openai-completions",
    provider: "local-gateway",
    model: "think-swarm",
    usage: {
      input: parts.input ?? 0,
      output: parts.output ?? 0,
      cacheRead: 3,
      cacheWrite: 0,
      totalTokens: (parts.input ?? 0) + (parts.output ?? 0),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: parts.stopReason ?? "stop",
    timestamp: 0,
  };
  return parts.errorMessage === undefined ? message : { ...message, errorMessage: parts.errorMessage };
}

export function toolCall(id: string, name: string, args: Record<string, unknown>): ToolCall {
  return { type: "toolCall", id, name, arguments: args };
}
