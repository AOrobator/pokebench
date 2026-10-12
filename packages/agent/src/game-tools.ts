import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent, ToolResultMessage } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { Value } from "typebox/value";

const NoArgs = Type.Object({});

const HealthSchema = Type.Object({ status: Type.String() });

const ScreenshotSchema = Type.Object({
  screenshot_base64: Type.String({ minLength: 1 }),
  step_number: Type.Integer(),
});

const StateSchema = Type.Object({
  player: Type.Object({ location: Type.String() }),
  step_number: Type.Integer(),
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class SmokeError extends Error {
  override readonly name = "SmokeError";
}

async function getJson(url: string, fetchFn: typeof fetch, timeoutMs = 15_000): Promise<unknown> {
  const response = await fetchFn(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`);
  return (await response.json()) as unknown;
}

export async function serverHealthy(gameServerUrl: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const body = await getJson(`${gameServerUrl}/health`, fetchFn, 2_000);
    return Value.Check(HealthSchema, body) && body.status === "healthy";
  } catch {
    return false;
  }
}

function checkFrame(base64: string): void {
  const bytes = Buffer.from(base64, "base64");
  const isPng =
    bytes.length >= 24 && bytes.subarray(0, 8).equals(PNG_SIGNATURE) && bytes.toString("ascii", 12, 16) === "IHDR";
  if (!isPng) throw new Error("/screenshot is not a PNG");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 240 || height !== 160) {
    throw new Error(`/screenshot is ${String(width)}x${String(height)}, expected 240x160`);
  }
}

export function screenshotTool(gameServerUrl: string, fetchFn: typeof fetch = fetch): AgentTool {
  return {
    name: "screenshot",
    label: "Screenshot",
    description: "Capture the current game frame as a PNG.",
    parameters: NoArgs,
    execute: async () => {
      const body = await getJson(`${gameServerUrl}/screenshot`, fetchFn);
      if (!Value.Check(ScreenshotSchema, body)) {
        throw new Error("malformed /screenshot payload");
      }
      checkFrame(body.screenshot_base64);
      return {
        content: [{ type: "image", data: body.screenshot_base64, mimeType: "image/png" }],
        details: undefined,
      };
    },
  };
}

export function stateTool(gameServerUrl: string, fetchFn: typeof fetch = fetch): AgentTool {
  return {
    name: "state",
    label: "Game state",
    description: "Read the parsed game state (location, position, badges, money).",
    parameters: NoArgs,
    execute: async () => {
      const body = await getJson(`${gameServerUrl}/state`, fetchFn);
      if (!Value.Check(StateSchema, body)) {
        throw new Error("malformed /state payload");
      }
      return { content: [{ type: "text", text: JSON.stringify(body) }], details: undefined };
    },
  };
}

export interface SmokeSummary {
  readonly toolCalls: string[];
  readonly texts: string[];
}

function assistantTexts(transcript: readonly AgentMessage[]): string[] {
  return transcript
    .filter((m): m is AssistantMessage => m.role === "assistant")
    .flatMap((m) => m.content.filter((c): c is TextContent => c.type === "text").map((c) => c.text.trim()))
    .filter((text) => text !== "");
}

function toolResults(transcript: readonly AgentMessage[]): ToolResultMessage[] {
  return transcript.filter((m): m is ToolResultMessage => m.role === "toolResult");
}

export function checkSmoke(transcript: readonly AgentMessage[]): SmokeSummary {
  const results = toolResults(transcript);
  const texts = assistantTexts(transcript);
  const failed = results.filter((r) => r.isError);
  if (failed.length > 0) {
    throw new SmokeError(`tool calls failed: ${failed.map((r) => r.toolName).join(", ")}`);
  }
  const toolCalls = results.map((r) => r.toolName);
  if (!toolCalls.includes("screenshot")) throw new SmokeError("screenshot tool was never called");
  if (!toolCalls.includes("state")) throw new SmokeError("no second tool call: state was never called");
  if (texts.length < 2) {
    throw new SmokeError(`expected a frame description and a final reply, got: ${texts.join(" | ")}`);
  }
  return { toolCalls, texts };
}
