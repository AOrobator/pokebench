// Live smoke for M3: a real pi-agent-core loop, against the real local stack
// gateway, calling a `screenshot` tool backed by the real game server on the
// real ROM. The model must describe the frame it was shown, then complete a
// second tool call. Entrypoint: excluded from coverage per INV-6 and
// exercised by `just smoke-llm`.

import { spawn, type ChildProcess } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  runAgentLoop,
  type AgentMessage,
  type AgentTool,
} from "@mariozechner/pi-agent-core";
import type { AssistantMessage, TextContent, ToolResultMessage } from "@mariozechner/pi-ai";
import { Type } from "typebox";
import { Value } from "typebox/value";
import { loadConfig, type PokebenchConfig } from "./config.js";
import { discoverModels, selectModel } from "./gateway.js";
import { gatewayLoopConfig } from "./provider.js";

const HEALTH_TIMEOUT_MS = 180_000;
const LOOP_TIMEOUT_MS = 420_000;

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

async function getJson(url: string, timeoutMs = 15_000): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`GET ${url} returned HTTP ${String(response.status)}`);
  return (await response.json()) as unknown;
}

async function serverHealthy(gameServerUrl: string): Promise<boolean> {
  try {
    const body = await getJson(`${gameServerUrl}/health`, 2_000);
    return Value.Check(HealthSchema, body) && body.status === "healthy";
  } catch {
    return false;
  }
}

// INV-2: argv list, never a shell string. The launcher prepares the ROM
// symlink and binds the server to 127.0.0.1.
function spawnGameServer(port: string): ChildProcess {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const python = join(repoRoot, "env", ".venv", "bin", "python");
  const child = spawn(python, ["-m", "pokebench_env.launcher"], {
    cwd: join(repoRoot, "env"),
    env: { ...process.env, POKEBENCH_GAME_PORT: port },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("error", (cause) => {
    console.error(`game server failed to start: ${String(cause)}`);
    process.exit(1);
  });
  return child;
}

async function waitForHealthyServer(gameServerUrl: string): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverHealthy(gameServerUrl)) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`game server not healthy within ${String(HEALTH_TIMEOUT_MS)} ms`);
}

function screenshotTool(gameServerUrl: string): AgentTool {
  return {
    name: "screenshot",
    label: "Screenshot",
    description: "Capture the current game frame as a PNG.",
    parameters: NoArgs,
    execute: async () => {
      const body = await getJson(`${gameServerUrl}/screenshot`);
      if (!Value.Check(ScreenshotSchema, body)) {
        throw new Error("malformed /screenshot payload");
      }
      return {
        content: [{ type: "image", data: body.screenshot_base64, mimeType: "image/png" }],
        details: undefined,
      };
    },
  };
}

function stateTool(gameServerUrl: string): AgentTool {
  return {
    name: "state",
    label: "Game state",
    description: "Read the parsed game state (location, position, badges, money).",
    parameters: NoArgs,
    execute: async () => {
      const body = await getJson(`${gameServerUrl}/state`);
      if (!Value.Check(StateSchema, body)) {
        throw new Error("malformed /state payload");
      }
      return { content: [{ type: "text", text: JSON.stringify(body) }], details: undefined };
    },
  };
}

const PROMPT =
  "Complete this protocol in order. Do not skip a step, and never send a message that only " +
  "describes progress without the tool call it asks for.\n" +
  "1. Call the screenshot tool.\n" +
  "2. In your next message, describe the frame you were shown in one short sentence and, " +
  "in that same message, call the state tool.\n" +
  "3. Reply DONE followed by the player location from the state result.\n" +
  "The task is not finished until step 3.";

function assistantTexts(transcript: readonly AgentMessage[]): string[] {
  return transcript
    .filter((m): m is AssistantMessage => m.role === "assistant")
    .flatMap((m) =>
      m.content.filter((c): c is TextContent => c.type === "text").map((c) => c.text.trim()),
    )
    .filter((text) => text !== "");
}

function toolResults(transcript: readonly AgentMessage[]): ToolResultMessage[] {
  return transcript.filter((m): m is ToolResultMessage => m.role === "toolResult");
}

function assertSmoke(transcript: readonly AgentMessage[]): void {
  const results = toolResults(transcript);
  const texts = assistantTexts(transcript);

  console.log("\n--- transcript ---");
  console.log(`tool calls: ${results.map((r) => `${r.toolName}${r.isError ? " (error)" : ""}`).join(", ") || "none"}`);
  for (const text of texts) console.log(`model: ${text}`);
  console.log("------------------");

  const failed = results.filter((r) => r.isError);
  if (failed.length > 0) {
    throw new Error(`tool calls failed: ${failed.map((r) => r.toolName).join(", ")}`);
  }
  const names = results.map((r) => r.toolName);
  if (!names.includes("screenshot")) throw new Error("screenshot tool was never called");
  if (!names.includes("state")) throw new Error("no second tool call: state was never called");

  if (texts.length < 2) {
    throw new Error(`expected a frame description and a final reply, got: ${texts.join(" | ")}`);
  }
}

async function main(): Promise<void> {
  const config: PokebenchConfig = loadConfig(process.env);
  const port = new URL(config.gameServerUrl).port !== "" ? new URL(config.gameServerUrl).port : "8000";

  if (await serverHealthy(config.gameServerUrl)) {
    throw new Error(
      `a game server is already healthy on ${config.gameServerUrl}; stop it first so the smoke ` +
        "runs against a server it owns",
    );
  }

  const models = await discoverModels({
    gatewayUrl: config.gatewayUrl,
    visionModels: config.visionModels,
  });
  const model = selectModel(models, config.model);
  if (!model.input.includes("image")) {
    throw new Error(`model ${config.model} is not a vision lane; the smoke needs one`);
  }
  console.log(`live smoke: model ${model.id} via ${config.gatewayUrl}, lane image=${String(model.input)}`);

  const server = spawnGameServer(port);
  const controller = new AbortController();
  const loopTimeout = setTimeout(() => {
    controller.abort();
  }, LOOP_TIMEOUT_MS);
  try {
    await waitForHealthyServer(config.gameServerUrl);
    console.log("game server healthy; running the agent loop");

    const prompt: AgentMessage = { role: "user", content: PROMPT, timestamp: Date.now() };
    const transcript = await runAgentLoop(
      [prompt],
      {
        systemPrompt: "You play Pokémon Emerald and report what you observe precisely.",
        messages: [],
        tools: [screenshotTool(config.gameServerUrl), stateTool(config.gameServerUrl)],
      },
      gatewayLoopConfig(model, "medium"),
      () => undefined,
      controller.signal,
    );
    assertSmoke(transcript);
    console.log(`smoke-llm OK: model ${model.id} described a real frame and completed two tool calls`);
  } finally {
    clearTimeout(loopTimeout);
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
    });
  }
}

main().catch((error: unknown) => {
  console.error(`smoke-llm FAILED: ${String(error)}`);
  process.exitCode = 1;
});
