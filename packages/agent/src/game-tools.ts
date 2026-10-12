import type { AgentMessage, AgentTool } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, TextContent, ToolResultMessage } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { ButtonSchema, type Button } from "./events.js";

const NoArgs = Type.Object({});

const HealthSchema = Type.Object({ status: Type.String() });

const ObservationSchema = Type.Object({
  state_text: Type.String(),
  screenshot_base64: Type.String({ minLength: 1 }),
  step_number: Type.Union([Type.Integer(), Type.Null()]),
});

const QueueSchema = Type.Object({ queue_empty: Type.Boolean() });

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export class SmokeError extends Error {
  override readonly name = "SmokeError";
}

function deadline(timeoutMs: number, signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal === undefined ? timeout : AbortSignal.any([timeout, signal]);
}

async function getJson(url: string, fetchFn: typeof fetch, timeoutMs = 15_000, signal?: AbortSignal): Promise<unknown> {
  const response = await fetchFn(url, { signal: deadline(timeoutMs, signal) });
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
  if (!isPng) throw new Error("observation frame is not a PNG");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width !== 240 || height !== 160) {
    throw new Error(`observation frame is ${String(width)}x${String(height)}, expected 240x160`);
  }
}

type ObservationContent = [ImageContent, TextContent];

async function observation(
  gameServerUrl: string,
  fetchFn: typeof fetch,
  signal: AbortSignal | undefined,
  prefix = "",
): Promise<ObservationContent> {
  const body = await getJson(`${gameServerUrl}/pokebench/observation`, fetchFn, 15_000, signal);
  if (!Value.Check(ObservationSchema, body)) throw new Error("malformed /pokebench/observation payload");
  checkFrame(body.screenshot_base64);
  return [
    { type: "image", data: body.screenshot_base64, mimeType: "image/png" },
    { type: "text", text: `${prefix}${body.state_text}` },
  ];
}

export function observeTool(gameServerUrl: string, fetchFn: typeof fetch = fetch): AgentTool {
  return {
    name: "observe",
    label: "Observe",
    description: "See the current game screen and the game state read from memory (location, party, map).",
    parameters: NoArgs,
    execute: async (_toolCallId, _params, signal) => ({
      content: await observation(gameServerUrl, fetchFn, signal),
      details: undefined,
    }),
  };
}

export interface Clock {
  sleep(ms: number): Promise<void>;
  now(): number;
}

const realClock: Clock = {
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => Date.now(),
};

const QUEUE_POLL_MS = 100;
const QUEUE_TIMEOUT_MS = 20_000;
// The vendor caches get_comprehensive_state for 100 ms; outwait it so the
// observation reflects the last press, not a state read mid-queue.
const STATE_CACHE_SETTLE_MS = 150;

export async function waitForQueue(
  gameServerUrl: string,
  fetchFn: typeof fetch,
  clock: Clock,
  signal?: AbortSignal,
): Promise<void> {
  const giveUpAt = clock.now() + QUEUE_TIMEOUT_MS;
  for (;;) {
    signal?.throwIfAborted();
    const body = await getJson(`${gameServerUrl}/queue_status`, fetchFn, 15_000, signal);
    if (!Value.Check(QueueSchema, body)) throw new Error("malformed /queue_status payload");
    if (body.queue_empty) return;
    if (clock.now() >= giveUpAt) throw new Error(`action queue did not drain within ${String(QUEUE_TIMEOUT_MS)} ms`);
    await clock.sleep(QUEUE_POLL_MS);
  }
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
  const ended = transcript.find(
    (m): m is AssistantMessage => m.role === "assistant" && (m.stopReason === "error" || m.stopReason === "aborted"),
  );
  if (ended !== undefined) {
    throw new SmokeError(`model turn ended: ${ended.stopReason}${ended.errorMessage ? ` (${ended.errorMessage})` : ""}`);
  }
  const results = toolResults(transcript);
  const texts = assistantTexts(transcript);
  const failed = results.filter((r) => r.isError);
  if (failed.length > 0) {
    throw new SmokeError(`tool calls failed: ${failed.map((r) => r.toolName).join(", ")}`);
  }
  const toolCalls = results.map((r) => r.toolName);
  if (!toolCalls.includes("observe")) throw new SmokeError("observe tool was never called");
  if (!toolCalls.includes("press")) throw new SmokeError("no second tool call: press was never called");
  if (texts.length < 2) {
    throw new SmokeError(`expected a frame description and a final reply, got: ${texts.join(" | ")}`);
  }
  return { toolCalls, texts };
}

const PressArgs = Type.Object({ buttons: Type.Array(ButtonSchema, { minItems: 1, maxItems: 8 }) });

const ActionSchema = Type.Object({ status: Type.String(), message: Type.Optional(Type.String()) });

export interface PressHooks {
  beforePress(toolCallId: string, buttons: readonly Button[]): void;
  afterPress(): Promise<void>;
}

export function pressTool(
  gameServerUrl: string,
  hooks: PressHooks,
  fetchFn: typeof fetch = fetch,
  clock: Clock = realClock,
): AgentTool<typeof PressArgs> {
  return {
    name: "press",
    label: "Press buttons",
    description:
      "Press Game Boy Advance buttons in order (up to 8), then see the resulting screen and game state.",
    parameters: PressArgs,
    execute: async (toolCallId, params, signal) => {
      // A stopped run (budget, operator abort) must not press anything further.
      signal?.throwIfAborted();
      hooks.beforePress(toolCallId, params.buttons);
      const url = `${gameServerUrl}/action`;
      const response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buttons: params.buttons }),
        signal: deadline(15_000, signal),
      });
      const body: unknown = await response.json();
      if (!response.ok || !Value.Check(ActionSchema, body) || body.status !== "success") {
        const detail = Value.Check(ActionSchema, body) ? (body.message ?? body.status) : `HTTP ${String(response.status)}`;
        throw new Error(`POST ${url} failed: ${detail}`);
      }
      await waitForQueue(gameServerUrl, fetchFn, clock, signal);
      await clock.sleep(STATE_CACHE_SETTLE_MS);
      await hooks.afterPress();
      const content = await observation(gameServerUrl, fetchFn, signal, `pressed ${params.buttons.join(", ")}\n\n`);
      return { content, details: undefined };
    },
  };
}

