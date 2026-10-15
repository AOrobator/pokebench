import type { AgentMessage, AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, ImageContent, TextContent, ToolResultMessage } from "@mariozechner/pi-ai";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";
import { ButtonSchema, StateBodySchema, type Button } from "./events.js";
import { parseGameState, type GameStateSnapshot } from "./game-state.js";
import { ShownStates, pressResult } from "./press-result.js";

// Which model-visible parts of the observe/press results this run shows.
export interface ToolSwitches { readonly readout: boolean; readonly pressResult: boolean; readonly position: boolean; readonly fieldLock: boolean; readonly safeInterfaces?: boolean; readonly automaticRunning?: boolean; readonly transitions?: boolean }
export const ALL_TOOL_SWITCHES: ToolSwitches = { readout: true, pressResult: true, position: true, fieldLock: true, automaticRunning: false, transitions: false };
import type { PressTiming } from "./recorder.js";

const NoArgs = Type.Object({});

const HealthSchema = Type.Object({ status: Type.String() });

const ObservationSchema = Type.Object({
  state_text: Type.String(),
  screenshot_base64: Type.String({ minLength: 1 }),
  state: StateBodySchema,
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
  prefix: string | ((state: GameStateSnapshot) => string) = "",
): Promise<{ content: ObservationContent; state: GameStateSnapshot }> {
  const body = await getJson(`${gameServerUrl}/pokebench/observation`, fetchFn, 15_000, signal);
  if (!Value.Check(ObservationSchema, body)) throw new Error("malformed /pokebench/observation payload");
  checkFrame(body.screenshot_base64);
  return { content: [
    { type: "image", data: body.screenshot_base64, mimeType: "image/png" },
    { type: "text", text: `${typeof prefix === "string" ? prefix : prefix(body.state)}${body.state_text}` },
  ], state: body.state };
}

export function observeTool(gameServerUrl: string, fetchFn: typeof fetch = fetch, switches: ToolSwitches = ALL_TOOL_SWITCHES, shown?: ShownStates): AgentTool {
  return {
    name: "observe",
    label: "Observe",
    description: switches.readout ? "See the current game screen and the game state read from memory (location, party, map)." : "See the current game screen.",
    parameters: NoArgs,
    execute: async (_toolCallId, _params, signal) => {
      const result = await observation(gameServerUrl, fetchFn, signal);
      shown?.record(result.state);
      return { content: result.content, details: { state: result.state } };
    },
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

const PressArgs = Type.Object({ buttons: Type.Array(ButtonSchema, { minItems: 1, maxItems: 8 }), walking: Type.Optional(Type.Boolean({description: "Walk deliberately; do not add automatic running to directional travel."})) });

const ActionSchema = Type.Object({ status: Type.String(), message: Type.Optional(Type.String()) });

// The pinned vendor's "normal" preset (server/app.py SPEED_PRESETS), sent
// explicitly so the log records what the server was asked to do.
export const PRESS_TIMING: PressTiming = { hold_frames: 10, release_frames: 8 };

/** Automatic B is a held modifier, not a second sequential button action. */
export function permitsAutomaticRunning(before: GameStateSnapshot | undefined, buttons: readonly Button[], walking: boolean | undefined, enabled: boolean | undefined): boolean {
  return enabled === true && walking !== true && buttons.length > 0 && buttons.every(button => ["UP", "DOWN", "LEFT", "RIGHT"].includes(button)) && before?.screen === "overworld" && !before.in_battle && before.field_controls_locked === false && before.active_ui == null && before.running?.permitted === true && before.running.controllable === true;
}

export interface PressModifiers { readonly automatic_running: boolean; readonly walking: boolean; readonly requested_held_buttons?: readonly Button[] }

export interface PressHooks {
  beforePress(toolCallId: string, buttons: readonly Button[], timing: PressTiming, before?: GameStateSnapshot, modifiers?: PressModifiers): void;
  afterPress(): Promise<void>;
}

export type BeforePressCheck=(before:GameStateSnapshot|undefined)=>void;
export type CheckedPressTool=AgentTool<typeof PressArgs> & {
 readonly executeChecked:(id:string,params:Static<typeof PressArgs>,check:BeforePressCheck,signal?:AbortSignal,update?:Parameters<AgentTool<typeof PressArgs>["execute"]>[3])=>Promise<AgentToolResult<{state:GameStateSnapshot|undefined}>>;
};
export function isCheckedPress(tool:AgentTool):tool is CheckedPressTool {return "executeChecked" in tool&&typeof tool.executeChecked==="function";}

export function submittedButtons(buttons:readonly Button[], before:GameStateSnapshot|undefined, switches:ToolSwitches):readonly Button[] {
  const freeField = before?.screen === "overworld" && before.started && !before.in_battle && before.field_controls_locked === false && before.active_ui == null && before.world_context?.dialogue == null && before.world_context?.message == null;
  const directional = buttons.every(button=>["UP","DOWN","LEFT","RIGHT"].includes(button));
  return switches.safeInterfaces && !(freeField && directional) ? buttons.slice(0,1) : buttons;
}
export function pressTool(
  gameServerUrl: string,
  hooks: PressHooks,
  fetchFn: typeof fetch = fetch,
  clock: Clock = realClock,
  switches: ToolSwitches = ALL_TOOL_SWITCHES,
  shown: ShownStates = new ShownStates(),
): CheckedPressTool {
  const execute=async(toolCallId:string,params:Static<typeof PressArgs>,signal?:AbortSignal,_update?:Parameters<AgentTool<typeof PressArgs>["execute"]>[3],check?:BeforePressCheck):Promise<AgentToolResult<{state:GameStateSnapshot|undefined}>>=>{
      // A stopped run (budget, operator abort) must not press anything further.
      signal?.throwIfAborted();
      let before: GameStateSnapshot | undefined;
      try {
        before = parseGameState(await getJson(`${gameServerUrl}/pokebench/state`, fetchFn, 15_000, signal));
      } catch (error) {
        // Preserve ordinary press operation for old/unavailable state servers;
        // the feedback explicitly withholds a before/after classification.
        signal?.throwIfAborted();
        if(check!==undefined)throw error;
      }
      check?.(before);
      const buttons = submittedButtons(params.buttons,before,switches);
      const automaticRunning = permitsAutomaticRunning(before, buttons, params.walking, switches.automaticRunning);
      if (switches.automaticRunning===true || params.walking!==undefined) hooks.beforePress(toolCallId, buttons, PRESS_TIMING, before, {automatic_running:automaticRunning,walking:params.walking===true,...(automaticRunning?{requested_held_buttons:["B"] as const}:{})});
      else hooks.beforePress(toolCallId, buttons, PRESS_TIMING, before);
      const url = `${gameServerUrl}${automaticRunning ? "/pokebench/travel" : "/action"}`;
      const response = await fetchFn(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buttons, ...PRESS_TIMING, ...(automaticRunning ? {automatic_running:true} : {}) }),
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
      const content = await observation(gameServerUrl, fetchFn, signal, (after) => `pressed ${buttons.join(", ")}\n${buttons.length < params.buttons.length ? `Interface safety: submitted 1 of ${String(params.buttons.length)} requested inputs; remaining inputs were not sent. Inspect the new state before another input.\n` : ""}${switches.pressResult ? `Press result: ${pressResult(before, after, buttons, switches, shown)}\n` : ""}\n`);
      shown.record(content.state);
      return { content: content.content, details: { state: content.state } };
  };
  return {
    name: "press",
    label: "Press buttons",
    description: (switches.readout
      ? "Press Game Boy Advance buttons in order (up to 8), then see the resulting screen and game state."
      : "Press Game Boy Advance buttons in order (up to 8), then see the resulting screen.") + (switches.safeInterfaces ? " Interaction/menu or locked/unknown-interface batches submit only the first input; inspect before continuing." : "") + (switches.automaticRunning===true ? " Direction-only field travel runs when native controls permit it; set walking=true to walk deliberately." : ""),
    parameters: PressArgs,
    execute,
    executeChecked:(id,params,check,signal,update)=>execute(id,params,signal,update,check),
  };
}


/** observe and press sharing what the model was last shown. */
export function gameTools(gameServerUrl: string, hooks: PressHooks, fetchFn: typeof fetch = fetch, switches: ToolSwitches = ALL_TOOL_SWITCHES, clock: Clock = realClock): [AgentTool, CheckedPressTool] {
  const shown = new ShownStates();
  return [observeTool(gameServerUrl, fetchFn, switches, shown), pressTool(gameServerUrl, hooks, fetchFn, clock, switches, shown)];
}
